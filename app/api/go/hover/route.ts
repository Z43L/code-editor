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
    const tempFile = path.join(tempDir, `temp_go_${Date.now()}.go`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use gopls for hover information
      const hover = await getGoplsHover(tempFile, content, position);

      return NextResponse.json({ hover });
    } catch (error) {
      console.error('Go hover error:', error);
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
    console.error('Go hover Error en API:', error);
    return NextResponse.json({ hover: null });
  }
}

async function getGoplsHover(filePath: string, content: string, position: number) {
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

      // Provide hover information based on Go knowledge
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
    'bool': 'bool representa un valor booleano (verdadero o falso).',
    'byte': 'byte es un alias para uint8.',
    'complex64': 'complex64 representa un número complejo con partes real e imaginaria float32.',
    'complex128': 'complex128 representa un número complejo con partes real e imaginaria float64.',
    'error': 'error es el tipo de valores de error en Go.',
    'float32': 'float32 representa un número de punto flotante de 32 bits.',
    'float64': 'float64 representa un número de punto flotante de 64 bits.',
    'int': 'int representa un entero con signo del mismo tamaño que uintptr.',
    'int8': 'int8 representa un entero con signo de 8 bits.',
    'int16': 'int16 representa un entero con signo de 16 bits.',
    'int32': 'int32 representa un entero con signo de 32 bits.',
    'int64': 'int64 representa un entero con signo de 64 bits.',
    'rune': 'rune es un alias para int32, representa un punto de código Unicode.',
    'string': 'string representa una secuencia de bytes.',
    'uint': 'uint representa un entero sin signo del mismo tamaño que uintptr.',
    'uint8': 'uint8 representa un entero sin signo de 8 bits.',
    'uint16': 'uint16 representa un entero sin signo de 16 bits.',
    'uint32': 'uint32 representa un entero sin signo de 32 bits.',
    'uint64': 'uint64 representa un entero sin signo de 64 bits.',
    'uintptr': 'uintptr representa un entero sin signo lo suficientemente grande para contener un puntero.'
  };

  // Funciones incorporadas
  const builtinFunctions: { [key: string]: string } = {
    'append': 'append(slice []T, elems ...T) []T\n\nAgrega elementos al final de un slice.',
    'cap': 'cap(v Type) int\n\nDevuelve la capacidad de v.',
    'close': 'close(c chan<- Type)\n\nCierra un canal.',
    'complex': 'complex(r, i FloatType) ComplexType\n\nConstruye un valor complejo.',
    'copy': 'copy(dst, src []Type) int\n\nCopia elementos desde src hacia dst.',
    'delete': 'delete(m map[Type]Type, key Type)\n\nElimina el elemento con la clave especificada del mapa.',
    'imag': 'imag(c ComplexType) FloatType\n\nDevuelve la parte imaginaria de c.',
    'len': 'len(v Type) int\n\nDevuelve la longitud de v.',
    'make': 'make(Type, size ...IntegerType) Type\n\nAsigna e inicializa un slice, mapa o canal.',
    'new': 'new(Type) *Type\n\nDevuelve un puntero a un valor cero recién asignado del tipo Type.',
    'panic': 'panic(v interface{})\n\nDetiene la ejecución normal y comienza a entrar en pánico.',
    'print': 'print(args ...Type)\n\nImprime args al error estándar.',
    'println': 'println(args ...Type)\n\nImprime args al error estándar seguido de una nueva línea.',
    'real': 'real(c ComplexType) FloatType\n\nDevuelve la parte real de c.',
    'recover': 'recover() interface{}\n\nSe recupera de un pánico.'
  };

  // Palabras clave de Go
  const keywords: { [key: string]: string } = {
    'break': 'break\n\nTermina la ejecución de la declaración for, switch o select más interna.',
    'case': 'case\n\nUna rama en una declaración switch o select.',
    'chan': 'chan\n\nDeclara un canal.',
    'const': 'const\n\nDeclara una constante.',
    'continue': 'continue\n\nComienza la siguiente iteración del bucle for más interno.',
    'default': 'default\n\nLa rama por defecto en una declaración switch.',
    'defer': 'defer\n\nDifiere la ejecución de una función hasta que la función circundante regrese.',
    'else': 'else\n\nLa rama alternativa en una declaración if.',
    'fallthrough': 'fallthrough\n\nTransfiere el control a la siguiente rama case en una declaración switch.',
    'for': 'for\n\nUn bucle.',
    'func': 'func\n\nDeclara una función.',
    'go': 'go\n\nInicia una nueva goroutine.',
    'goto': 'goto\n\nTransfiere el control a una declaración etiquetada.',
    'if': 'if\n\nUna declaración condicional.',
    'import': 'import\n\nDeclara una importación.',
    'interface': 'interface\n\nDeclara un tipo interfaz.',
    'map': 'map\n\nDeclara un tipo mapa.',
    'package': 'package\n\nDeclara el paquete al que pertenece este archivo.',
    'range': 'range\n\nItera sobre elementos de un arreglo, slice, string, mapa o canal.',
    'return': 'return\n\nRegresa de una función.',
    'select': 'select\n\nUna declaración de selección.',
    'struct': 'struct\n\nDeclara un tipo struct.',
    'switch': 'switch\n\nUna declaración switch.',
    'type': 'type\n\nDeclara un tipo.',
    'var': 'var\n\nDeclara una variable.'
  };

  // Funciones comunes de la biblioteca estándar
  const stdlibFunctions: { [key: string]: string } = {
    'fmt.Println': 'func Println(a ...interface{}) (n int, err error)\n\nImprime a la salida estándar con una nueva línea.',
    'fmt.Printf': 'func Printf(format string, a ...interface{}) (n int, err error)\n\nImprime salida formateada a la salida estándar.',
    'fmt.Sprintf': 'func Sprintf(format string, a ...interface{}) string\n\nDevuelve un string formateado.',
    'os.Open': 'func Open(name string) (*File, error)\n\nAbre el archivo nombrado para lectura.',
    'os.Create': 'func Create(name string) (*File, error)\n\nCrea el archivo nombrado con modo 0666.',
    'strings.Contains': 'func Contains(s, substr string) bool\n\nReporta si substr está dentro de s.',
    'strings.Split': 'func Split(s, sep string) []string\n\nCorta s en todas las substrings separadas por sep.',
    'strings.Join': 'func Join(elems []string, sep string) string\n\nConcatena los elementos de elems con sep.',
    'strconv.Itoa': 'func Itoa(i int) string\n\nConvierte int a string.',
    'strconv.Atoi': 'func Atoi(s string) (int, error)\n\nConvierte string a int.',
    'time.Now': 'func Now() Time\n\nDevuelve la hora local actual.',
    'time.Sleep': 'func Sleep(d Duration)\n\nPausa la goroutine actual por al menos la duración d.',
    'json.Marshal': 'func Marshal(v interface{}) ([]byte, error)\n\nDevuelve la codificación JSON de v.',
    'json.Unmarshal': 'func Unmarshal(data []byte, v interface{}) error\n\nAnaliza los datos codificados en JSON y almacena el resultado en v.',
    'http.Get': 'func Get(url string) (resp *Response, err error)\n\nEmite un GET a la URL especificada.',
    'http.Post': 'func Post(url string, contentType string, body io.Reader) (resp *Response, err error)\n\nPublica en la URL especificada.',
    'http.ListenAndServe': 'func ListenAndServe(addr string, handler Handler) error\n\nEscucha en la dirección dada y sirve peticiones HTTP.'
  };

  if (builtinTypes[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`go\n${word}\n\`\`\`\n\n${builtinTypes[word]}`
      }
    };
  }

  if (builtinFunctions[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`go\n${word}()\n\`\`\`\n\n${builtinFunctions[word]}`
      }
    };
  }

  if (keywords[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`go\n${word}\n\`\`\`\n\n${keywords[word]}`
      }
    };
  }

  if (stdlibFunctions[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`go\n${word}\n\`\`\`\n\n${stdlibFunctions[word]}`
      }
    };
  }

  // Check for user-defined functions/types in the code
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('func ') && trimmed.includes(word + '(')) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`go\n${trimmed}\n\`\`\`\n\nFunción definida por el usuario`
        }
      };
    }
    if (trimmed.startsWith('type ') && trimmed.includes(word)) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`go\n${trimmed}\n\`\`\`\n\nTipo definido por el usuario`
        }
      };
    }
  }

  return null;
}