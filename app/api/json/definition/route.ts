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

interface DefinitionLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
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
      return NextResponse.json({ definition: null });
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

    // Ejecutar definition con timeout
    const definition = await Promise.race([
      runJsonDefinition(content, line, character),
      new Promise<DefinitionLocation | null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ definition });

  } catch (error) {
    console.error('Error in JSON definition:', error);

    // Fallback a definition básico
    const basicDefinition = getBasicJsonDefinition(content, position);
    return NextResponse.json({ definition: basicDefinition });
  }
}

async function runJsonDefinition(content: string, line: number, character: number): Promise<DefinitionLocation | null> {
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
    const definitionPromise = new Promise<DefinitionLocation | null>((resolve, reject) => {
      server.stdout.on('data', (data: Buffer) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.id === requestId && response.result) {
            const result = response.result;
            if (Array.isArray(result) && result.length > 0) {
              resolve(result[0]);
            } else if (result) {
              resolve(result);
            } else {
              resolve(null);
            }
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

    // Enviar solicitud de definition
    const definitionMessage = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'textDocument/definition',
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

    server.stdin.write(JSON.stringify(definitionMessage) + '\r\n');

    const result = await definitionPromise;

    server.kill();

    // Limpiar archivo temporal
    try {
      await fs.unlink(tempFilePath);
    } catch (e) {
      // Ignorar errores de limpieza
    }

    return result;

  } catch (lspError) {
    console.log('LSP not available, using basic definition');
    // Fallback a definition básico
    return null;
  }
}

function getBasicJsonDefinition(content: string, position: number): DefinitionLocation | null {
  // En JSON, las "definiciones" son menos comunes, pero podemos implementar:
  // 1. Navegación a referencias $ref en JSON Schema
  // 2. Navegación a definiciones de propiedades
  // 3. Navegación a valores referenciados

  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';

  // Detectar si estamos sobre una referencia $ref
  const refMatch = currentLine.match(/("\$ref"\s*:\s*"([^"]+)")/);
  if (refMatch) {
    const refValue = refMatch[2];
    const refStart = currentLine.indexOf(refMatch[1]);
    const refEnd = refStart + refMatch[1].length;

    if (character >= refStart && character <= refEnd) {
      // Intentar encontrar la definición referenciada
      const definition = findJsonSchemaDefinition(content, refValue);
      if (definition) {
        return definition;
      }
    }
  }

  // Detectar si estamos sobre una propiedad que podría tener una definición
  const propertyMatch = currentLine.match(/"([^"]+)"\s*:/);
  if (propertyMatch) {
    const propertyName = propertyMatch[1];
    const propertyStart = currentLine.indexOf(`"${propertyName}"`);
    const propertyEnd = propertyStart + propertyName.length + 2;

    if (character >= propertyStart && character <= propertyEnd) {
      // Buscar si hay una definición de esta propiedad en el esquema
      const definition = findPropertyDefinition(content, propertyName);
      if (definition) {
        return definition;
      }
    }
  }

  // Detectar si estamos sobre un valor que hace referencia a una definición
  const valueMatch = currentLine.match(/:\s*("([^"]+)")/);
  if (valueMatch) {
    const value = valueMatch[2];
    const valueStart = currentLine.indexOf(valueMatch[1]);
    const valueEnd = valueStart + valueMatch[1].length;

    if (character >= valueStart && character <= valueEnd) {
      // Buscar si este valor hace referencia a una definición
      const definition = findValueDefinition(content, value);
      if (definition) {
        return definition;
      }
    }
  }

  return null;
}

function findJsonSchemaDefinition(content: string, refValue: string): DefinitionLocation | null {
  try {
    const parsed = JSON.parse(content);

    // Si es una referencia local (#/definitions/... o #/components/schemas/...)
    if (refValue.startsWith('#/')) {
      const path = refValue.substring(2).split('/');
      let current: any = parsed;

      for (const segment of path) {
        if (current && typeof current === 'object') {
          current = current[segment];
        } else {
          return null;
        }
      }

      if (current) {
        // Encontrar la línea donde está definida esta referencia
        const lines = content.split('\n');
        const searchPattern = new RegExp(`"${path[path.length - 1]}"\\s*:\\s*`);

        for (let i = 0; i < lines.length; i++) {
          if (searchPattern.test(lines[i])) {
            return {
              uri: 'file://current.json',
              range: {
                start: { line: i, character: 0 },
                end: { line: i, character: lines[i].length }
              }
            };
          }
        }
      }
    }

    // Si es una referencia externa, no podemos navegar a ella
    return null;
  } catch (e) {
    return null;
  }
}

function findPropertyDefinition(content: string, propertyName: string): DefinitionLocation | null {
  try {
    const parsed = JSON.parse(content);

    // Buscar en definiciones de esquema
    if (parsed.definitions && parsed.definitions[propertyName]) {
      const lines = content.split('\n');
      const searchPattern = new RegExp(`"${propertyName}"\\s*:\\s*`);

      for (let i = 0; i < lines.length; i++) {
        if (searchPattern.test(lines[i])) {
          return {
            uri: 'file://current.json',
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: lines[i].length }
            }
          };
        }
      }
    }

    // Buscar en componentes/schemas (OpenAPI)
    if (parsed.components && parsed.components.schemas && parsed.components.schemas[propertyName]) {
      const lines = content.split('\n');
      const searchPattern = new RegExp(`"${propertyName}"\\s*:\\s*`);

      for (let i = 0; i < lines.length; i++) {
        if (searchPattern.test(lines[i])) {
          return {
            uri: 'file://current.json',
            range: {
              start: { line: i, character: 0 },
              end: { line: i, character: lines[i].length }
            }
          };
        }
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function findValueDefinition(content: string, value: string): DefinitionLocation | null {
  // Buscar si este valor está definido en algún lugar del documento
  const lines = content.split('\n');
  const searchPattern = new RegExp(`"${value}"\\s*:\\s*`);

  for (let i = 0; i < lines.length; i++) {
    if (searchPattern.test(lines[i])) {
      return {
        uri: 'file://current.json',
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: lines[i].length }
        }
      };
    }
  }

  return null;
}