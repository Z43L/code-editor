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
      const tempDir = path.join(os.tmpdir(), 'css-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.css`;
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

    // Ejecutar validación CSS con timeout
    const diagnostics = await Promise.race([
      runCssDiagnostics(content),
      new Promise<Diagnostic[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 3000)
      )
    ]);

    return NextResponse.json({ diagnostics });

  } catch (error) {
    console.error('Error in CSS diagnostics:', error);

    // Retornar diagnóstico de error genérico
    const diagnostics: Diagnostic[] = [{
      line: 0,
      character: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'css-validator'
    }];

    return NextResponse.json({ diagnostics });
  }
}

async function runCssDiagnostics(content: string): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  try {
    // Intentar usar stylelint si está disponible
    const tempDir = path.join(os.tmpdir(), 'css-lsp');
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.css`;
    const tempFilePath = path.join(tempDir, tempFileName);

    await fs.writeFile(tempFilePath, content, 'utf8');

    try {
      const { stdout } = await execAsync(`npx stylelint --formatter json ${tempFilePath}`, {
        timeout: 2000,
        maxBuffer: 1024 * 1024
      });

      if (stdout.trim()) {
        const results = JSON.parse(stdout);
        for (const result of results) {
          if (result.warnings) {
            for (const warning of result.warnings) {
              diagnostics.push({
                line: warning.line - 1, // Convertir a 0-based
                character: warning.column - 1, // Convertir a 0-based
                severity: warning.severity === 'error' ? 'error' : 'warning',
                message: warning.text,
                source: 'stylelint',
                code: warning.rule
              });
            }
          }
        }
      }
    } catch (stylelintError) {
      // Si stylelint no está disponible, usar validación básica
      diagnostics.push(...runBasicCssValidation(content));
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
    diagnostics.push(...runBasicCssValidation(content));
  }

  return diagnostics;
}

function runBasicCssValidation(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');

  // Stack para verificar llaves balanceadas
  const braceStack: Array<{line: number, char: number}> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let charIndex = 0;

    // Verificar llaves balanceadas
    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '{') {
        braceStack.push({ line: i, char: j });
      } else if (char === '}') {
        if (braceStack.length === 0) {
          diagnostics.push({
            line: i,
            character: j,
            severity: 'error',
            message: 'Unexpected closing brace }',
            source: 'css-validator'
          });
        } else {
          braceStack.pop();
        }
      }
    }

    // Verificar sintaxis básica de propiedades
    const propertyRegex = /([a-zA-Z-]+)\s*:\s*([^;]+);/g;
    let propMatch;
    while ((propMatch = propertyRegex.exec(line)) !== null) {
      const property = propMatch[1];
      const value = propMatch[2].trim();

      // Validaciones básicas de propiedades comunes
      if (property === 'color' || property === 'background-color' || property === 'border-color') {
        if (!isValidColor(value)) {
          diagnostics.push({
            line: i,
            character: propMatch.index,
            severity: 'warning',
            message: `Invalid color value: ${value}`,
            source: 'css-validator'
          });
        }
      }

      // Verificar unidades en propiedades numéricas
      if (property === 'width' || property === 'height' || property === 'font-size' ||
          property === 'margin' || property === 'padding') {
        if (/^\d+$/.test(value) && !value.includes('px') && !value.includes('%') &&
            !value.includes('em') && !value.includes('rem') && value !== '0') {
          diagnostics.push({
            line: i,
            character: propMatch.index,
            severity: 'warning',
            message: `Numeric value should have a unit: ${value}`,
            source: 'css-validator'
          });
        }
      }
    }

    // Detectar propiedades sin punto y coma
    const incompletePropertyRegex = /([a-zA-Z-]+)\s*:\s*([^}]+)$/g;
    const incompleteMatch = incompletePropertyRegex.exec(line);
    if (incompleteMatch && !line.trim().endsWith('}') && !line.trim().endsWith('{')) {
      diagnostics.push({
        line: i,
        character: incompleteMatch.index,
        severity: 'warning',
        message: 'Property declaration should end with semicolon',
        source: 'css-validator'
      });
    }
  }

  // Verificar llaves sin cerrar
  while (braceStack.length > 0) {
    const unclosedBrace = braceStack.pop()!;
    diagnostics.push({
      line: unclosedBrace.line,
      character: unclosedBrace.char,
      severity: 'error',
      message: 'Unclosed brace {',
      source: 'css-validator'
    });
  }

  return diagnostics;
}

function isValidColor(value: string): boolean {
  // Colores nombrados comunes
  const namedColors = new Set([
    'black', 'white', 'red', 'green', 'blue', 'yellow', 'purple', 'orange',
    'pink', 'gray', 'grey', 'brown', 'cyan', 'magenta', 'lime', 'maroon',
    'navy', 'olive', 'silver', 'teal', 'aqua', 'fuchsia', 'transparent'
  ]);

  if (namedColors.has(value.toLowerCase())) {
    return true;
  }

  // Colores hexadecimales
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/.test(value)) {
    return true;
  }

  // Funciones de color: rgb(), rgba(), hsl(), hsla()
  if (/^(rgb|rgba|hsl|hsla)\(.+\)$/.test(value)) {
    return true;
  }

  return false;
}