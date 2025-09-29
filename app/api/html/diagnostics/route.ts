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

interface Diagnostic {
  line: number;
  character: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  code?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { fileName, content } = await request.json();

    if (!content || !fileName) {
      return NextResponse.json({ diagnostics: [] });
    }

    // Verificar si tenemos un archivo en cache válido
    const cacheKey = `${fileName}:${content.length}`;
    const cached = tempFileCache.get(cacheKey);
    const now = Date.now();

    let tempFilePath: string;
    if (cached && (now - cached.timestamp) < CACHE_DURATION && cached.content === content) {
      tempFilePath = cached.tempPath;
    } else {
      // Crear archivo temporal
      const tempDir = path.join(os.tmpdir(), 'html-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
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

    // Ejecutar validación HTML con timeout
    const diagnostics = await Promise.race([
      runHtmlDiagnostics(content),
      new Promise<Diagnostic[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ diagnostics });

  } catch (error) {
    console.error('Error in HTML diagnostics:', error);

    // Retornar diagnóstico de error genérico
    const diagnostics: Diagnostic[] = [{
      line: 0,
      character: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'html-validator'
    }];

    return NextResponse.json({ diagnostics });
  }
}

async function runHtmlDiagnostics(content: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');

  try {
    // Intentar usar tidy si está disponible
    const tempDir = path.join(os.tmpdir(), 'html-lsp');
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.html`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, content, 'utf8');

    try {
      const { stdout, stderr } = await execAsync(`tidy -q -e ${tempFilePath}`, {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      });

      const output = stderr || stdout;
      if (output.trim()) {
        // Parsear salida de tidy
        const tidyLines = output.split('\n').filter(line => line.trim());
        for (const line of tidyLines) {
          // Formato típico: "line X column Y - Error: message"
          const match = line.match(/line (\d+) column (\d+)\s*-\s*(Error|Warning|Info):\s*(.+)/i);
          if (match) {
            const [, lineNum, charNum, severity, message] = match;
            diagnostics.push({
              line: parseInt(lineNum) - 1,
              character: parseInt(charNum) - 1,
              severity: severity.toLowerCase() as 'error' | 'warning' | 'info',
              message: message.trim(),
              source: 'tidy'
            });
          }
        }
      }
    } catch (tidyError) {
      // Si tidy no está disponible, usar validación básica
      diagnostics.push(...runBasicHtmlValidation(content));
    } finally {
      // Limpiar archivo temporal
      try {
        await fs.unlink(tempFilePath);
      } catch (e) {
        // Ignorar errores de limpieza
      }
    }

  } catch (error) {
    // Fallback a validación básica
    diagnostics.push(...runBasicHtmlValidation(content));
  }

  return diagnostics;
}

function runBasicHtmlValidation(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');

  // Stack para verificar tags balanceados
  const tagStack: Array<{tag: string, line: number, char: number}> = [];
  const selfClosingTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let charIndex = 0;

    // Buscar tags HTML
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    let match;

    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      const isClosing = fullTag.startsWith('</');
      const position = match.index;

      if (isClosing) {
        // Tag de cierre
        if (tagStack.length === 0) {
          diagnostics.push({
            line: i,
            character: position,
            severity: 'error',
            message: `Unexpected closing tag </${tagName}>`,
            source: 'html-validator'
          });
        } else {
          const lastTag = tagStack.pop()!;
          if (lastTag.tag !== tagName) {
            diagnostics.push({
              line: i,
              character: position,
              severity: 'error',
              message: `Mismatched tag: expected </${lastTag.tag}> but found </${tagName}>`,
              source: 'html-validator'
            });
          }
        }
      } else {
        // Tag de apertura
        if (!selfClosingTags.has(tagName)) {
          tagStack.push({ tag: tagName, line: i, char: position });
        }
      }

      charIndex = position + fullTag.length;
    }
  }

  // Verificar tags sin cerrar
  while (tagStack.length > 0) {
    const unclosedTag = tagStack.pop()!;
    diagnostics.push({
      line: unclosedTag.line,
      character: unclosedTag.char,
      severity: 'error',
      message: `Unclosed tag <${unclosedTag.tag}>`,
      source: 'html-validator'
    });
  }

  // Validaciones adicionales básicas
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detectar atributos sin comillas
    const attrRegex = /\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*([^"'\s>]+)/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(line)) !== null) {
      const attrValue = attrMatch[2];
      if (!attrValue.startsWith('"') && !attrValue.startsWith("'")) {
        diagnostics.push({
          line: i,
          character: attrMatch.index + attrMatch[0].indexOf('=') + 1,
          severity: 'warning',
          message: `Attribute value should be quoted: ${attrMatch[1]}="${attrValue}"`,
          source: 'html-validator'
        });
      }
    }
  }

  return diagnostics;
}