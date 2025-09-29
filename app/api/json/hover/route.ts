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

interface HoverInfo {
  contents: string | { kind: string; value: string }[];
  range?: {
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
      return NextResponse.json({ hover: null });
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

    // Ejecutar hover con timeout
    const hover = await Promise.race([
      runJsonHover(content, line, character),
      new Promise<HoverInfo | null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ hover });

  } catch (error) {
    console.error('Error in JSON hover:', error);

    // Fallback a hover básico
    const basicHover = getBasicJsonHover(content, position);
    return NextResponse.json({ hover: basicHover });
  }
}

async function runJsonHover(content: string, line: number, character: number): Promise<HoverInfo | null> {
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
    const hoverPromise = new Promise<HoverInfo | null>((resolve, reject) => {
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

    // Enviar solicitud de hover
    const hoverMessage = {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'textDocument/hover',
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

    server.stdin.write(JSON.stringify(hoverMessage) + '\r\n');

    const result = await hoverPromise;

    server.kill();

    // Limpiar archivo temporal
    try {
      await fs.unlink(tempFilePath);
    } catch (e) {
      // Ignorar errores de limpieza
    }

    return result;

  } catch (lspError) {
    console.log('LSP not available, using basic hover');
    // Fallback a hover básico
    return null;
  }
}

function getBasicJsonHover(content: string, position: number): HoverInfo | null {
  // Calcular línea y carácter desde la posición
  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';

  // Encontrar el token bajo el cursor
  const beforeCursor = currentLine.substring(0, character);
  const afterCursor = currentLine.substring(character);

  // Detectar si estamos sobre una palabra clave JSON
  const keywords = ['true', 'false', 'null'];
  for (const keyword of keywords) {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`);
    const match = beforeCursor.match(keywordRegex);
    if (match) {
      const startPos = beforeCursor.lastIndexOf(keyword);
      const endPos = startPos + keyword.length;

      if (character >= startPos && character <= endPos) {
        return {
          contents: getKeywordDocumentation(keyword),
          range: {
            start: { line, character: startPos },
            end: { line, character: endPos }
          }
        };
      }
    }
  }

  // Detectar si estamos sobre una cadena
  const stringMatch = beforeCursor.match(/"([^"]*)"?\s*$/);
  if (stringMatch) {
    const stringStart = beforeCursor.lastIndexOf('"');
    const stringEnd = character;

    if (character >= stringStart && character <= stringEnd) {
      return {
        contents: 'Valor de cadena JSON\n\nUna secuencia de caracteres Unicode envueltos en comillas dobles.',
        range: {
          start: { line, character: stringStart },
          end: { line, character: stringEnd }
        }
      };
    }
  }

  // Detectar si estamos sobre un número
  const numberMatch = beforeCursor.match(/(\d+(?:\.\d+)?)\s*$/);
  if (numberMatch) {
    const numberStart = beforeCursor.lastIndexOf(numberMatch[1]);
    const numberEnd = numberStart + numberMatch[1].length;

    if (character >= numberStart && character <= numberEnd) {
      return {
        contents: 'Valor numérico JSON\n\nUn valor numérico que puede ser un entero o un número de punto flotante.',
        range: {
          start: { line, character: numberStart },
          end: { line, character: numberEnd }
        }
      };
    }
  }

  // Detectar propiedades conocidas en archivos JSON comunes
  try {
    const parsed = JSON.parse(content);
    const hover = getPropertyHover(content, position, parsed);
    if (hover) return hover;
  } catch (e) {
    // No se pudo parsear, continuar
  }

  return null;
}

function getKeywordDocumentation(keyword: string): string {
  const docs: { [key: string]: string } = {
    'true': 'Booleano true\n\nRepresenta el valor lógico verdadero.',
    'false': 'Booleano false\n\nRepresenta el valor lógico falso.',
    'null': 'Valor nulo\n\nRepresenta la ausencia de cualquier valor de objeto.'
  };
  return docs[keyword] || keyword;
}

function getPropertyHover(content: string, position: number, parsed: any): HoverInfo | null {
  // Esta es una implementación simplificada
  // En una implementación completa, analizaríamos la estructura JSON
  // para encontrar la propiedad exacta bajo el cursor

  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';

  // Buscar propiedades en la línea actual
  const propertyMatch = currentLine.match(/"([^"]+)"\s*:/);
  if (propertyMatch) {
    const propertyName = propertyMatch[1];
    const propertyStart = currentLine.indexOf(`"${propertyName}"`);
    const propertyEnd = propertyStart + propertyName.length + 2; // +2 para las comillas

    if (character >= propertyStart && character <= propertyEnd) {
      return {
        contents: getPropertyDocumentation(propertyName, parsed),
        range: {
          start: { line, character: propertyStart },
          end: { line, character: propertyEnd }
        }
      };
    }
  }

  return null;
}

function getPropertyDocumentation(propertyName: string, parsed: any): string {
  // Documentación para propiedades comunes en diferentes tipos de archivos JSON

  // package.json properties
  if (parsed.name || parsed.version) {
    const packageDocs: { [key: string]: string } = {
      'name': 'Nombre del paquete\n\nEl nombre del paquete. Debe estar en minúsculas y ser seguro para URLs.',
      'version': 'Versión del paquete\n\nLa versión actual del paquete siguiendo el versionado semántico.',
      'description': 'Descripción del paquete\n\nUna breve descripción del paquete.',
      'main': 'Punto de entrada principal\n\nEl punto de entrada principal al paquete.',
      'scripts': 'Scripts NPM\n\nScripts que se pueden ejecutar con npm run.',
      'dependencies': 'Dependencias de tiempo de ejecución\n\nPaquetes requeridos para que la aplicación funcione.',
      'devDependencies': 'Dependencias de desarrollo\n\nPaquetes requeridos para desarrollo y pruebas.',
      'keywords': 'Palabras clave del paquete\n\nPalabras clave para ayudar a identificar el paquete.',
      'author': 'Autor del paquete\n\nEl autor del paquete.',
      'license': 'Licencia del paquete\n\nLa licencia bajo la cual se distribuye el paquete.'
    };

    if (packageDocs[propertyName]) {
      return packageDocs[propertyName];
    }
  }

  // tsconfig.json properties
  if (parsed.compilerOptions || parsed.include) {
    const tsconfigDocs: { [key: string]: string } = {
      'compilerOptions': 'Opciones del compilador TypeScript\n\nOpciones para configurar el compilador TypeScript.',
      'include': 'Archivos a incluir\n\nArreglo de patrones de archivo para incluir en la compilación.',
      'exclude': 'Archivos a excluir\n\nArreglo de patrones de archivo para excluir de la compilación.',
      'extends': 'Configuración base\n\nRuta a un archivo de configuración base para extender.',
      'references': 'Referencias de proyecto\n\nArreglo de referencias de proyecto para proyectos compuestos.'
    };

    if (tsconfigDocs[propertyName]) {
      return tsconfigDocs[propertyName];
    }
  }

  // Generic property documentation
  return `Propiedad: ${propertyName}\n\nUna propiedad JSON con la clave "${propertyName}".`;
}