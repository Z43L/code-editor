import { NextRequest, NextResponse } from 'next/server';

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

    // Ejecutar validación JSON
    const diagnostics = runJsonDiagnostics(content);

    return NextResponse.json({ diagnostics });

  } catch (error) {
    console.error('Error in JSON diagnostics:', error);

    // Retornar diagnóstico de error genérico
    const diagnostics: Diagnostic[] = [{
      line: 0,
      character: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'json-validator'
    }];

    return NextResponse.json({ diagnostics });
  }
}

function runJsonDiagnostics(content: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = content.split('\n');

  if (!content.trim()) {
    return diagnostics;
  }

  try {
    // Intentar parsear el JSON
    JSON.parse(content);
  } catch (error: any) {
    // Si hay error de parsing, intentar determinar la línea y columna
    const errorMessage = error.message;

    // Extraer información de posición del error
    let line = 0;
    let character = 0;

    // Buscar patrones comunes en mensajes de error de JSON
    const positionMatch = errorMessage.match(/position (\d+)/);
    if (positionMatch) {
      const position = parseInt(positionMatch[1]);
      let currentPos = 0;

      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 por el \n
        if (currentPos + lineLength > position) {
          line = i;
          character = position - currentPos;
          break;
        }
        currentPos += lineLength;
      }
    }

    // Intentar identificar el tipo de error
    let message = 'Invalid JSON';
    if (errorMessage.includes('Unexpected token')) {
      message = 'Unexpected token in JSON';
    } else if (errorMessage.includes('Expected')) {
      message = 'Expected valid JSON token';
    } else if (errorMessage.includes('Unterminated string')) {
      message = 'Unterminated string literal';
    } else if (errorMessage.includes('Unexpected end')) {
      message = 'Unexpected end of JSON input';
    }

    diagnostics.push({
      line,
      character,
      severity: 'error',
      message,
      source: 'json-parser'
    });
  }

  // Validaciones adicionales más allá del parsing básico
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Detectar trailing commas (no permitidas en JSON)
    if (trimmedLine.endsWith(',')) {
      // Verificar si es realmente una trailing comma inválida
      const beforeComma = line.substring(0, line.lastIndexOf(',')).trim();
      if (beforeComma.endsWith(']') || beforeComma.endsWith('}')) {
        continue; // Esta comma es válida (cierra un array u objeto)
      }

      // Verificar si la siguiente línea no es el cierre
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (!nextLine.startsWith('}') && !nextLine.startsWith(']')) {
          diagnostics.push({
            line: i,
            character: line.lastIndexOf(','),
            severity: 'error',
            message: 'Trailing comma not allowed in JSON',
            source: 'json-validator'
          });
        }
      }
    }

    // Detectar comentarios (no permitidos en JSON estricto)
    const commentMatch = line.match(/(\/\/|\/\*|\*\/)/);
    if (commentMatch) {
      diagnostics.push({
        line: i,
        character: commentMatch.index || 0,
        severity: 'warning',
        message: 'Comments are not allowed in JSON',
        source: 'json-validator'
      });
    }

    // Detectar NaN, Infinity, -Infinity (no válidos en JSON)
    const invalidValueMatch = line.match(/\b(NaN|Infinity|-Infinity)\b/);
    if (invalidValueMatch) {
      diagnostics.push({
        line: i,
        character: invalidValueMatch.index || 0,
        severity: 'error',
        message: `${invalidValueMatch[1]} is not a valid JSON value`,
        source: 'json-validator'
      });
    }
  }

  // Verificar que el JSON sea un objeto o array válido en el nivel superior
  if (content.trim()) {
    const firstChar = content.trim()[0];
    if (firstChar !== '{' && firstChar !== '[') {
      diagnostics.push({
        line: 0,
        character: content.length - content.trimLeft().length,
        severity: 'error',
        message: 'JSON must start with an object { or array [',
        source: 'json-validator'
      });
    }
  }

  return diagnostics;
}