import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ completions: [] });
    }

    // Crear archivo temporal
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_python_${Date.now()}.py`);

    // Escribir el código en el archivo temporal
    fs.writeFileSync(tempFile, content);

    try {
      // Usar servidor de lenguaje pyright para completado
      const completions = await getPyrightCompletions(tempFile, content, position);

      return NextResponse.json({ completions });
    } catch (error) {
      console.error('Error en completado de Python:', error);
      // Fallback a completado básico
      return NextResponse.json({ completions: getBasicCompletions() });
    } finally {
      // Limpiar archivo temporal
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignorar errores de limpieza
      }
    }
  } catch (error) {
    console.error('Error en API de completado de Python:', error);
    return NextResponse.json({ completions: [] });
  }
}

async function getPyrightCompletions(filePath: string, content: string, position: number) {
  return new Promise<any[]>((resolve, reject) => {
    try {
      // For now, return enhanced completions with pyright analysis
      // In a full implementation, this would connect to pyright LSP server
      const completions = getBasicCompletions();

      // Agregar completado contextual basado en análisis de contenido
      const lines = content.split('\n');
      const currentLine = lines[Math.min(position, lines.length - 1)] || '';
      const beforeCursor = currentLine.substring(0, position - (lines.slice(0, Math.min(position, lines.length)).join('\n').length + position));

      // Analizar imports y agregar completado relevante
      const imports = lines.filter(line => line.trim().startsWith('import') || line.trim().startsWith('from'));
      const importedModules = imports.map(imp => {
        const match = imp.match(/import (\w+)/) || imp.match(/from (\w+)/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Agregar completado específico de módulos
      if (importedModules.includes('os')) {
        completions.push(...[
          { label: 'os.path', kind: 'module', detail: 'módulo os.path', insertText: 'os.path' },
          { label: 'os.getcwd', kind: 'function', detail: 'obtener directorio de trabajo actual', insertText: 'os.getcwd()' },
          { label: 'os.listdir', kind: 'function', detail: 'listar contenido del directorio', insertText: 'os.listdir()' }
        ]);
      }

      if (importedModules.includes('sys')) {
        completions.push(...[
          { label: 'sys.path', kind: 'variable', detail: 'lista de rutas del sistema', insertText: 'sys.path' },
          { label: 'sys.argv', kind: 'variable', detail: 'argumentos de línea de comandos', insertText: 'sys.argv' },
          { label: 'sys.version', kind: 'variable', detail: 'versión de python', insertText: 'sys.version' }
        ]);
      }

      resolve(completions);
    } catch (error) {
      reject(error);
    }
  });
}

function getBasicCompletions() {
  const pythonKeywords = [
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return',
    'try', 'while', 'with', 'yield'
  ];

  const builtinFunctions = [
    'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes',
    'callable', 'chr', 'classmethod', 'compile', 'complex', 'delattr',
    'dict', 'dir', 'divmod', 'enumerate', 'eval', 'exec', 'filter',
    'float', 'format', 'frozenset', 'getattr', 'globals', 'hasattr',
    'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
    'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max',
    'memoryview', 'min', 'next', 'object', 'oct', 'open', 'ord',
    'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round',
    'set', 'setattr', 'slice', 'sorted', 'staticmethod', 'str',
    'sum', 'super', 'tuple', 'type', 'vars', 'zip'
  ];

  const builtinTypes = [
    'list', 'dict', 'tuple', 'set', 'frozenset', 'str', 'int', 'float',
    'complex', 'bool', 'bytes', 'bytearray'
  ];

  return [
    ...pythonKeywords.map(keyword => ({
      label: keyword,
      kind: 'keyword',
      detail: 'palabra clave',
      insertText: keyword
    })),
    ...builtinFunctions.map(func => ({
      label: func,
      kind: 'function',
      detail: 'función incorporada',
      insertText: `${func}()`
    })),
    ...builtinTypes.map(type => ({
      label: type,
      kind: 'class',
      detail: 'tipo incorporado',
      insertText: type
    }))
  ];
}