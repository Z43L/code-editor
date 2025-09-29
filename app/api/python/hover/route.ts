import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ hover: null });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_python_${Date.now()}.py`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use pyright for hover information
      const hover = await getPyrightHover(tempFile, content, position);

      return NextResponse.json({ hover });
    } catch (error) {
      console.error('Python hover error:', error);
      return NextResponse.json({ hover: null });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Python hover Error en API:', error);
    return NextResponse.json({ hover: null });
  }
}

async function getPyrightHover(filePath: string, content: string, position: number) {
  return new Promise<any>((resolve, reject) => {
    try {
      // Calculate line and character from position
      const lines = content.substring(0, position).split('\n');
      const line = lines.length - 1;
      const character = lines[lines.length - 1].length;

      // Get the word at the current position
      const currentLine = content.split('\n')[line] || '';
      const wordMatch = currentLine.substring(0, character).match(/(\w+)$/);
      const word = wordMatch ? wordMatch[1] : '';

      if (!word) {
        resolve(null);
        return;
      }

      // Provide hover information based on Python knowledge
      const hoverInfo = getHoverInfo(word, content);

      resolve(hoverInfo);
    } catch (error) {
      reject(error);
    }
  });
}

function getHoverInfo(word: string, content: string) {
  // Tipos incorporados
  const builtinTypes: { [key: string]: string } = {
    'str': 'str(objeto) -> str\nstr(bytes_o_buffer[, codificación[, errores]]) -> str\n\nCrea un nuevo objeto string a partir del objeto dado.',
    'int': 'int(x=0) -> entero\nint(x, base=10) -> entero\n\nConvierte un número o string a un entero.',
    'float': 'float(x=0) -> número de punto flotante\n\nConvierte un string o número a un número de punto flotante.',
    'bool': 'bool(x) -> bool\n\nDevuelve True cuando el argumento x es verdadero, False en caso contrario.',
    'list': 'list() -> nueva lista vacía\nlist(iterable) -> nueva lista inicializada desde los items del iterable\n\nSecuencia mutable incorporada.',
    'dict': 'dict() -> nuevo diccionario vacío\ndict(mapeo) -> nuevo diccionario inicializado desde los pares\n    (clave, valor) de un objeto de mapeo\ndict(iterable) -> nuevo diccionario inicializado como si fuera:\n    d = {}\n    for clave, valor in iterable:\n        d[clave] = valor',
    'tuple': 'tuple() -> tupla vacía\ntuple(iterable) -> tupla inicializada desde los items del iterable\n\nSecuencia inmutable incorporada.',
    'set': 'set() -> nuevo objeto conjunto vacío\nset(iterable) -> nuevo objeto conjunto\n\nConstruye una colección desordenada de elementos únicos.',
    'None': 'El único valor del tipo NoneType. None se usa frecuentemente para representar la ausencia de un valor.',
    'True': 'Valor booleano que representa verdad.',
    'False': 'Valor booleano que representa falsedad.'
  };

  // Funciones incorporadas
  const builtinFunctions: { [key: string]: string } = {
    'print': 'print(*objetos, sep=\' \', end=\'\\n\', file=sys.stdout, flush=False)\n\nImprime objetos al flujo de texto file, separados por sep y seguidos por end.',
    'len': 'len(objeto, /)\n\nDevuelve el número de items en un contenedor.',
    'range': 'range(stop) -> objeto range\nrange(start, stop[, step]) -> objeto range\n\nDevuelve un objeto que produce una secuencia de enteros desde start (inclusive) hasta stop (exclusive) con paso step.',
    'input': 'input(prompt)\n\nLee un string desde la entrada estándar. El salto de línea final es eliminado.',
    'open': 'open(archivo, modo=\'r\', buffering=-1, encoding=None, errors=None, newline=None, closefd=True, opener=None)\n\nAbre archivo y devuelve un flujo.',
    'abs': 'abs(x, /)\n\nDevuelve el valor absoluto del argumento.',
    'max': 'max(iterable, *[, key, default]) -> valor\nmax(arg1, arg2, *args, *[, key]) -> valor\n\nDevuelve el item más grande en un iterable o el más grande de dos o más argumentos.',
    'min': 'min(iterable, *[, key, default]) -> valor\nmin(arg1, arg2, *args, *[, key]) -> valor\n\nDevuelve el item más pequeño en un iterable o el más pequeño de dos o más argumentos.',
    'sum': 'sum(iterable, /, start=0)\n\nDevuelve la suma de un valor \'start\' más un iterable de números.',
    'type': 'type(objeto) -> el tipo del objeto\ntype(nombre, bases, dict) -> un nuevo tipo\n\nDevuelve el tipo de un objeto.',
    'isinstance': 'isinstance(objeto, classinfo) -> bool\n\nDevuelve si un objeto es una instancia de una clase o de una subclase de la misma.',
    'str': 'str(objeto) -> str\nstr(bytes_o_buffer[, codificación[, errores]]) -> str\n\nCrea un nuevo objeto string a partir del objeto dado.',
    'int': 'int(x=0) -> integer\nint(x, base=10) -> integer\n\nConvert a number or string to an integer.',
    'float': 'float(x=0) -> floating point number\n\nConvert a string or number to a floating point number.'
  };

  // Palabras clave
  const keywords: { [key: string]: string } = {
    'def': 'Define una función.',
    'class': 'Define una clase.',
    'if': 'Sentencia condicional.',
    'elif': 'Sino si condicional.',
    'else': 'Cláusula else.',
    'for': 'Bucle for.',
    'while': 'Bucle while.',
    'try': 'Bloque try para manejo de excepciones.',
    'except': 'Bloque except para manejo de excepciones.',
    'finally': 'Bloque finally (siempre ejecutado).',
    'with': 'Administrador de contexto.',
    'import': 'Importa un módulo.',
    'from': 'Importa desde un módulo.',
    'return': 'Retorna desde una función.',
    'yield': 'Produce desde un generador.',
    'lambda': 'Función anónima.',
    'and': 'Y lógico.',
    'or': 'O lógico.',
    'not': 'No lógico.',
    'in': 'Prueba de membresía.',
    'is': 'Prueba de identidad.',
    'True': 'Valor booleano verdadero.',
    'False': 'Valor booleano falso.',
    'None': 'Valor nulo.'
  };

  if (builtinTypes[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`python\n${word}\n\`\`\`\n\n${builtinTypes[word]}`
      }
    };
  }

  if (builtinFunctions[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`python\n${word}()\n\`\`\`\n\n${builtinFunctions[word]}`
      }
    };
  }

  if (keywords[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`python\n${word}\n\`\`\`\n\n${keywords[word]}`
      }
    };
  }

  // Verificar funciones/variables definidas por el usuario en el código
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('def ') && trimmed.includes(word + '(')) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`python\n${trimmed}\n\`\`\`\n\nFunción definida por el usuario`
        }
      };
    }
    if (trimmed.startsWith('class ') && trimmed.includes(word)) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`python\n${trimmed}\n\`\`\`\n\nClase definida por el usuario`
        }
      };
    }
  }

  return null;
}