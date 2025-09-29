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

interface CompletionItem {
  label: string;
  kind: string;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
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
      return NextResponse.json({ completions: [] });
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

    // Ejecutar completions con timeout
    const completions = await Promise.race([
      runJsonCompletions(content, line, character),
      new Promise<CompletionItem[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ completions });

  } catch (error) {
    console.error('Error in JSON completions:', error);

    // Fallback a completions básicas
    const basicCompletions = getBasicJsonCompletions(content, position);
    return NextResponse.json({ completions: basicCompletions });
  }
}

async function runJsonCompletions(content: string, line: number, character: number): Promise<CompletionItem[]> {
  const completions: CompletionItem[] = [];

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
    const completionPromise = new Promise<CompletionItem[]>((resolve, reject) => {
      server.stdout.on('data', (data: Buffer) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.id === requestId && response.result) {
            const items = response.result.items || [];
            resolve(items.map((item: any) => ({
              label: item.label,
              kind: getCompletionKind(item.kind),
              detail: item.detail,
              documentation: item.documentation?.value || item.documentation,
              insertText: item.insertText || item.textEdit?.newText,
              sortText: item.sortText,
              filterText: item.filterText
            })));
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

    // Enviar solicitud de completions
    const completionMessage = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'textDocument/completion',
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

    server.stdin.write(JSON.stringify(completionMessage) + '\r\n');

    const result = await completionPromise;

    server.kill();

    // Limpiar archivo temporal
    try {
      await fs.unlink(tempFilePath);
    } catch (e) {
      // Ignorar errores de limpieza
    }

    return result;

  } catch (lspError) {
    console.log('LSP not available, using basic completions');
    // Fallback a completions básicas
    return getBasicJsonCompletions(content, content.length);
  }
}

function getBasicJsonCompletions(content: string, position: number): CompletionItem[] {
  const completions: CompletionItem[] = [];

  // Calcular línea y carácter desde la posición
  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';
  const beforeCursor = currentLine.substring(0, character);

  // Completions básicas de JSON
  const jsonKeywords = [
    { label: 'true', kind: 'keyword', detail: 'Boolean true' },
    { label: 'false', kind: 'keyword', detail: 'Boolean false' },
    { label: 'null', kind: 'keyword', detail: 'Null value' }
  ];

  // Detectar contexto
  const trimmedBefore = beforeCursor.trim();

  // Si estamos después de una coma o al inicio de un array/objeto
  if (trimmedBefore.endsWith(',') || trimmedBefore.endsWith('[') || trimmedBefore.endsWith('{')) {
    completions.push(...jsonKeywords);
  }

  // Si estamos en una cadena
  const stringMatch = beforeCursor.match(/"([^"]*)$/);
  if (stringMatch) {
    // Completions para valores de cadena
    completions.push({
      label: 'string',
      kind: 'value',
      detail: 'String value',
      insertText: '"${1:value}"',
      documentation: 'A JSON string value'
    });
  }

  // Si estamos después de dos puntos (valor de propiedad)
  if (trimmedBefore.includes(':')) {
    const afterColon = trimmedBefore.split(':').pop()?.trim() || '';
    if (!afterColon) {
      completions.push(...jsonKeywords);
      completions.push({
        label: 'string',
        kind: 'value',
        detail: 'String value',
        insertText: '"${1:value}"'
      });
      completions.push({
        label: 'number',
        kind: 'value',
        detail: 'Number value',
        insertText: '${1:0}'
      });
      completions.push({
        label: 'object',
        kind: 'value',
        detail: 'Object value',
        insertText: '{$1}'
      });
      completions.push({
        label: 'array',
        kind: 'value',
        detail: 'Array value',
        insertText: '[${1}]'
      });
    }
  }

  // Completions de propiedades comunes para archivos JSON conocidos
  if (content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(content + '"}'); // Completar temporalmente para parsear
      // Si es un package.json
      if (parsed.name || parsed.version) {
        completions.push(
          { label: 'name', kind: 'property', detail: 'Package name' },
          { label: 'version', kind: 'property', detail: 'Package version' },
          { label: 'description', kind: 'property', detail: 'Package description' },
          { label: 'main', kind: 'property', detail: 'Main entry point' },
          { label: 'scripts', kind: 'property', detail: 'NPM scripts' },
          { label: 'dependencies', kind: 'property', detail: 'Runtime dependencies' },
          { label: 'devDependencies', kind: 'property', detail: 'Development dependencies' },
          { label: 'keywords', kind: 'property', detail: 'Package keywords' },
          { label: 'author', kind: 'property', detail: 'Package author' },
          { label: 'license', kind: 'property', detail: 'Package license' }
        );
      }
      // Si es un tsconfig.json
      else if (parsed.compilerOptions || parsed.include) {
        completions.push(
          { label: 'compilerOptions', kind: 'property', detail: 'TypeScript compiler options' },
          { label: 'include', kind: 'property', detail: 'Files to include' },
          { label: 'exclude', kind: 'property', detail: 'Files to exclude' },
          { label: 'extends', kind: 'property', detail: 'Base configuration' },
          { label: 'references', kind: 'property', detail: 'Project references' }
        );
      }
    } catch (e) {
      // No se pudo parsear, continuar con completions genéricas
    }
  }

  return completions;
}

function getCompletionKind(kind: number): string {
  const kinds = {
    1: 'text',
    2: 'method',
    3: 'function',
    4: 'constructor',
    5: 'field',
    6: 'variable',
    7: 'class',
    8: 'interface',
    9: 'module',
    10: 'property',
    11: 'unit',
    12: 'value',
    13: 'enum',
    14: 'keyword',
    15: 'snippet',
    16: 'color',
    17: 'file',
    18: 'reference',
    19: 'folder',
    20: 'enumMember',
    21: 'constant',
    22: 'struct',
    23: 'event',
    24: 'operator',
    25: 'typeParameter'
  };
  return kinds[kind as keyof typeof kinds] || 'text';
}