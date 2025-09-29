import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

// Cache para archivos temporales
const tempFileCache = new Map<string, { content: string; tempPath: string; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 segundos

interface SignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string;
    parameters?: Array<{
      label: string;
      documentation?: string;
    }>;
  }>;
  activeSignature: number;
  activeParameter: number;
}

export async function POST(request: NextRequest) {
  let content = '';
  let position = 0;

  try {
    const body = await request.json();
    content = body.content || '';
    position = body.position || 0;
    const fileName = body.fileName || '';

    if (!content) {
      return NextResponse.json({ signatureHelp: null });
    }

    // Calcular línea y carácter desde la posición
    const lines = content.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    // Verificar si tenemos un archivo en cache válido
    const cacheKey = `${fileName}:${content.length}`;
    const cached = tempFileCache.get(cacheKey);
    const now = Date.now();

    let tempFilePath: string;
    if (cached && (now - cached.timestamp) < CACHE_DURATION && cached.content === content) {
      tempFilePath = cached.tempPath;
    } else {
      // Crear archivo temporal
      const tempDir = path.join(os.tmpdir(), 'json-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
      tempFilePath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempFilePath, content, 'utf8');

      // Actualizar cache
      tempFileCache.set(cacheKey, {
        content,
        tempPath: tempFilePath,
        timestamp: now
      });

      // Limpiar cache antiguo
      for (const [key, value] of tempFileCache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
          try {
            await fs.unlink(value.tempPath);
          } catch (e) {
            // Ignorar errores al eliminar archivos temporales
          }
          tempFileCache.delete(key);
        }
      }
    }

    // Ejecutar signature help con timeout
    const signatureHelp = await Promise.race([
      runJsonSignatureHelp(content, line, character),
      new Promise<SignatureHelp | null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ signatureHelp });

  } catch (error) {
    console.error('Error in JSON signature help:', error);

    // Fallback a signature help básico
    const basicSignatureHelp = getBasicJsonSignatureHelp(content, position);
    return NextResponse.json({ signatureHelp: basicSignatureHelp });
  }
}

async function runJsonSignatureHelp(content: string, line: number, character: number): Promise<SignatureHelp | null> {
  try {
    // Intentar usar vscode-json-languageserver si está disponible
    const { spawn } = require('child_process');

    // Crear archivo temporal para el servidor
    const tempDir = path.join(os.tmpdir(), 'json-lsp-server');
    await fs.mkdir(tempDir, { recursive: true });

    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, content, 'utf8');

    // Inicializar servidor LSP
    const server = spawn('vscode-json-languageserver', ['--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: tempDir
    });

    let responseData = '';
    let requestId = 1;

    // Promesa para esperar la respuesta
    const signaturePromise = new Promise<SignatureHelp | null>((resolve, reject) => {
      server.stdout.on('data', (data: Buffer) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.id === requestId && response.result) {
            resolve(response.result);
          }
        } catch (e) {
          // Aún no es una respuesta completa
        }
      });

      server.stderr.on('data', (data: Buffer) => {
        console.error('JSON LSP stderr:', data.toString());
      });

      server.on('close', () => {
        reject(new Error('LSP server closed'));
      });

      setTimeout(() => {
        reject(new Error('Timeout waiting for LSP response'));
      }, 2000);
    });

    // Enviar inicialización
    const initMessage = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        processId: process.pid,
        rootPath: tempDir,
        rootUri: `file://${tempDir}`,
        capabilities: {}
      }
    };

    server.stdin.write(JSON.stringify(initMessage) + '\r\n');

    // Esperar inicialización
    await new Promise(resolve => setTimeout(resolve, 100));

    // Enviar solicitud de signature help
    const signatureMessage = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'textDocument/signatureHelp',
      params: {
        textDocument: {
          uri: `file://${tempFilePath}`
        },
        position: {
          line: line,
          character: character
        }
      }
    };

    server.stdin.write(JSON.stringify(signatureMessage) + '\r\n');

    const result = await signaturePromise;

    server.kill();

    // Limpiar archivo temporal
    try {
      await fs.unlink(tempFilePath);
    } catch (e) {
      // Ignorar errores de limpieza
    }

    return result;

  } catch (lspError) {
    console.log('LSP not available, using basic signature help');
    // Fallback a signature help básico
    return null;
  }
}

function getBasicJsonSignatureHelp(content: string, position: number): SignatureHelp | null {
  // JSON no tiene funciones como lenguajes de programación, pero podemos proporcionar
  // ayuda para estructuras comunes o esquemas

  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';
  const beforeCursor = currentLine.substring(0, character);

  // Detectar si estamos dentro de una estructura de objeto
  if (beforeCursor.includes('{') && !beforeCursor.includes('}')) {
    const openBraces = (beforeCursor.match(/{/g) || []).length;
    const closeBraces = (beforeCursor.match(/}/g) || []).length;

    if (openBraces > closeBraces) {
      // Estamos dentro de un objeto, proporcionar ayuda para propiedades
      const signature = getJsonObjectSignature(content);
      if (signature) {
        return {
          signatures: [signature],
          activeSignature: 0,
          activeParameter: 0
        };
      }
    }
  }

  // Detectar si estamos dentro de una estructura de array
  if (beforeCursor.includes('[') && !beforeCursor.includes(']')) {
    const openBrackets = (beforeCursor.match(/\[/g) || []).length;
    const closeBrackets = (beforeCursor.match(/\]/g) || []).length;

    if (openBrackets > closeBrackets) {
      // Estamos dentro de un array, proporcionar ayuda para elementos
      const signature = getJsonArraySignature(content);
      if (signature) {
        return {
          signatures: [signature],
          activeSignature: 0,
          activeParameter: 0
        };
      }
    }
  }

  return null;
}

function getJsonObjectSignature(content: string): { label: string; documentation: string; parameters: any[] } | null {
  try {
    // Intentar detectar el tipo de objeto JSON basado en el contenido
    const parsed = JSON.parse(content + '"}'); // Completar temporalmente

    // package.json
    if (parsed.name || parsed.version) {
      return {
        label: '{ name, version, description, main, scripts, dependencies, ... }',
        documentation: 'NPM package.json structure',
        parameters: [
          { label: 'name', documentation: 'Package name (required)' },
          { label: 'version', documentation: 'Package version (required)' },
          { label: 'description', documentation: 'Package description' },
          { label: 'main', documentation: 'Main entry point' },
          { label: 'scripts', documentation: 'NPM scripts object' },
          { label: 'dependencies', documentation: 'Runtime dependencies' },
          { label: 'devDependencies', documentation: 'Development dependencies' }
        ]
      };
    }

    // tsconfig.json
    if (parsed.compilerOptions || parsed.include) {
      return {
        label: '{ compilerOptions, include, exclude, extends, ... }',
        documentation: 'TypeScript configuration structure',
        parameters: [
          { label: 'compilerOptions', documentation: 'TypeScript compiler options' },
          { label: 'include', documentation: 'Files to include in compilation' },
          { label: 'exclude', documentation: 'Files to exclude from compilation' },
          { label: 'extends', documentation: 'Base configuration file' },
          { label: 'references', documentation: 'Project references' }
        ]
      };
    }

    // JSON Schema
    if (parsed.$schema || parsed.type || parsed.properties) {
      return {
        label: '{ $schema, type, properties, required, ... }',
        documentation: 'JSON Schema structure',
        parameters: [
          { label: '$schema', documentation: 'Schema URI' },
          { label: 'type', documentation: 'Data type' },
          { label: 'properties', documentation: 'Object properties' },
          { label: 'required', documentation: 'Required properties array' },
          { label: 'items', documentation: 'Array item schema' }
        ]
      };
    }

    // Generic object
    return {
      label: '{ "key": value, ... }',
      documentation: 'JSON object structure',
      parameters: [
        { label: '"key"', documentation: 'Property name in double quotes' },
        { label: 'value', documentation: 'Property value (string, number, object, array, boolean, null)' }
      ]
    };

  } catch (e) {
    // No se pudo parsear, devolver estructura genérica
    return {
      label: '{ "key": value, ... }',
      documentation: 'JSON object structure',
      parameters: [
        { label: '"key"', documentation: 'Property name in double quotes' },
        { label: 'value', documentation: 'Property value (string, number, object, array, boolean, null)' }
      ]
    };
  }
}

function getJsonArraySignature(content: string): { label: string; documentation: string; parameters: any[] } | null {
  return {
    label: '[ value1, value2, ... ]',
    documentation: 'JSON array structure',
    parameters: [
      { label: 'value1, value2, ...', documentation: 'Array elements (string, number, object, array, boolean, null)' }
    ]
  };
}