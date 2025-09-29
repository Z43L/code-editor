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
    const tempFile = path.join(tempDir, `temp_java_${Date.now()}.java`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use enhanced Java hover
      const hover = await getJavaHover(tempFile, content, position);

      return NextResponse.json({ hover });
    } catch (error) {
      console.error('Java hover error:', error);
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
    console.error('Java hover Error en API:', error);
    return NextResponse.json({ hover: null });
  }
}

async function getJavaHover(filePath: string, content: string, position: number) {
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

      // Provide hover information based on Java knowledge
      const hoverInfo = getHoverInfo(word, content);

      resolve(hoverInfo);
    } catch (error) {
      reject(error);
    }
  });
}

function getHoverInfo(word: string, content: string) {
  // Primitive types
  const primitiveTypes: { [key: string]: string } = {
    'boolean': 'boolean: El tipo de datos boolean tiene solo dos valores posibles: true y false.',
    'byte': 'byte: El tipo de datos byte es un entero de complemento a dos de 8 bits con signo.',
    'char': 'char: El tipo de datos char es un único carácter Unicode de 16 bits.',
    'double': 'double: El tipo de datos double es un punto flotante IEEE 754 de doble precisión de 64 bits.',
    'float': 'float: El tipo de datos float es un punto flotante IEEE 754 de precisión simple de 32 bits.',
    'int': 'int: El tipo de datos int es un entero de complemento a dos de 32 bits con signo.',
    'long': 'long: El tipo de datos long es un entero de complemento a dos de 64 bits con signo.',
    'short': 'short: El tipo de datos short es un entero de complemento a dos de 16 bits con signo.',
    'void': 'void: La palabra clave void especifica que un método no tiene un valor de retorno.'
  };

  // Common classes
  const commonClasses: { [key: string]: string } = {
    'String': 'String: La clase String representa cadenas de caracteres.',
    'Object': 'Object: La clase Object es la raíz de la jerarquía de clases.',
    'Integer': 'Integer: La clase Integer envuelve un valor del tipo primitivo int.',
    'Double': 'Double: La clase Double envuelve un valor del tipo primitivo double.',
    'Boolean': 'Boolean: La clase Boolean envuelve un valor del tipo primitivo boolean.',
    'ArrayList': 'ArrayList: Implementación de arreglo redimensionable de la interfaz List.',
    'HashMap': 'HashMap: Implementación basada en tabla hash de la interfaz Map.',
    'HashSet': 'HashSet: Esta clase implementa la interfaz Set, respaldada por una tabla hash.',
    'System': 'System: La clase System contiene varios campos y métodos útiles de clase.',
    'Math': 'Math: La clase Math contiene métodos para realizar operaciones numéricas básicas.',
    'Arrays': 'Arrays: Esta clase contiene varios métodos para manipular arreglos.',
    'Collections': 'Collections: Esta clase consiste exclusivamente de métodos estáticos que operan en colecciones.',
    'Scanner': 'Scanner: Un escáner de texto simple que puede analizar tipos primitivos y strings.',
    'PrintWriter': 'PrintWriter: Imprime representaciones formateadas de objetos a un flujo de salida de texto.',
    'File': 'File: Una representación abstracta de nombres de ruta de archivos y directorios.',
    'Exception': 'Exception: La clase Exception y sus subclases son una forma de Throwable.',
    'RuntimeException': 'RuntimeException: RuntimeException es la superclase de aquellas excepciones que pueden ser lanzadas durante la operación normal de la Máquina Virtual Java.',
    'IOException': 'IOException: Señala que ha ocurrido una excepción de E/S de algún tipo.',
    'NullPointerException': 'NullPointerException: Lanzada cuando una aplicación intenta usar null en un caso donde se requiere un objeto.'
  };

  // Common methods
  const commonMethods: { [key: string]: string } = {
    'equals': 'boolean equals(Object obj)\nIndica si algún otro objeto es "igual a" este.',
    'hashCode': 'int hashCode()\nDevuelve un valor de código hash para el objeto.',
    'toString': 'String toString()\nDevuelve una representación de string del objeto.',
    'clone': 'Object clone()\nCrea y devuelve una copia de este objeto.',
    'getClass': 'Class<?> getClass()\nDevuelve la clase de tiempo de ejecución de este Object.',
    'notify': 'void notify()\nDespierta a un solo hilo que está esperando en el monitor de este objeto.',
    'notifyAll': 'void notifyAll()\nDespierta a todos los hilos que están esperando en el monitor de este objeto.',
    'wait': 'void wait()\nHace que el hilo actual espere hasta que otro hilo invoque el método notify().',
    'length': 'int length()\nDevuelve la longitud de este string.',
    'charAt': 'char charAt(int index)\nDevuelve el valor char en el índice especificado.',
    'substring': 'String substring(int beginIndex)\nDevuelve un string que es una subcadena de este string.',
    'indexOf': 'int indexOf(String str)\nDevuelve el índice dentro de este string de la primera ocurrencia de la subcadena especificada.',
    'lastIndexOf': 'int lastIndexOf(String str)\nDevuelve el índice dentro de este string de la última ocurrencia de la subcadena especificada.',
    'replace': 'String replace(CharSequence target, CharSequence replacement)\nReemplaza cada subcadena que coincide con la secuencia literal objetivo.',
    'split': 'String[] split(String regex)\nDivide este string alrededor de las coincidencias de la expresión regular dada.',
    'trim': 'String trim()\nDevuelve un string cuyo valor es este string, con cualquier espacio en blanco inicial y final removido.',
    'parseInt': 'static int parseInt(String s)\nAnaliza el argumento string como un entero decimal con signo.',
    'parseDouble': 'static double parseDouble(String s)\nDevuelve un nuevo double inicializado al valor representado por el String especificado.',
    'valueOf': 'static String valueOf(Object obj)\nDevuelve la representación de string del argumento Object.',
    'toLowerCase': 'String toLowerCase()\nConvierte todos los caracteres en este String a minúsculas.',
    'toUpperCase': 'String toUpperCase()\nConvierte todos los caracteres en este String a mayúsculas.',
    'add': 'boolean add(E e)\nAgrega el elemento especificado al final de esta lista.',
    'remove': 'boolean remove(Object o)\nRemueve la primera ocurrencia del elemento especificado de esta lista.',
    'get': 'E get(int index)\nDevuelve el elemento en la posición especificada en esta lista.',
    'set': 'E set(int index, E element)\nReemplaza el elemento en la posición especificada en esta lista con el elemento especificado.',
    'size': 'int size()\nDevuelve el número de elementos en esta colección.',
    'isEmpty': 'boolean isEmpty()\nDevuelve true si esta colección no contiene elementos.',
    'contains': 'boolean contains(Object o)\nDevuelve true si esta colección contiene el elemento especificado.',
    'clear': 'void clear()\nRemueve todos los elementos de esta colección.',
    'println': 'void println(String x)\nImprime un String y luego termina la línea.',
    'print': 'void print(String s)\nImprime un string.',
    'printf': 'PrintWriter printf(String format, Object... args)\nUn método conveniente para escribir un string formateado a este escritor.',
    'readLine': 'String readLine()\nLee una línea de texto.',
    'next': 'String next()\nEncuentra y devuelve el siguiente token completo desde este escáner.',
    'nextInt': 'int nextInt()\nEscanea el siguiente token de la entrada como un int.',
    'nextDouble': 'double nextDouble()\nEscanea el siguiente token de la entrada como un double.',
    'sin': 'static double sin(double a)\nDevuelve el seno trigonométrico de un ángulo.',
    'cos': 'static double cos(double a)\nDevuelve el coseno trigonométrico de un ángulo.',
    'tan': 'static double tan(double a)\nDevuelve la tangente trigonométrica de un ángulo.',
    'sqrt': 'static double sqrt(double a)\nDevuelve la raíz cuadrada positiva correctamente redondeada de un valor double.',
    'pow': 'static double pow(double a, double b)\nDevuelve el valor del primer argumento elevado a la potencia del segundo argumento.',
    'abs': 'static int abs(int a)\nReturns the absolute value of an int value.',
    'max': 'static int max(int a, int b)\nReturns the greater of two int values.',
    'min': 'static int min(int a, int b)\nReturns the lesser of two int values.',
    'random': 'static double random()\nReturns a double value with a positive sign, greater than or equal to 0.0 and less than 1.0.',
    'sort': 'static void sort(int[] a)\nSorts the specified array into ascending numerical order.',
    'binarySearch': 'static int binarySearch(int[] a, int key)\nSearches the specified array for the specified value using the binary search algorithm.',
    'fill': 'static void fill(int[] a, int val)\nAssigns the specified int value to each element of the specified array of ints.',
    'copyOf': 'static int[] copyOf(int[] original, int newLength)\nCopies the specified array, truncating or padding with zeros.',
    'asList': 'static <T> List<T> asList(T... a)\nReturns a fixed-size list backed by the specified array.'
  };

  // Keywords
  const keywords: { [key: string]: string } = {
    'abstract': 'abstract: A method without body (no implementation).',
    'assert': 'assert: Used for debugging purposes.',
    'break': 'break: Breaks out of a loop or a switch statement.',
    'case': 'case: Marks a block of code in switch statements.',
    'catch': 'catch: Catches exceptions generated by try statements.',
    'class': 'class: Declares a class.',
    'const': 'const: Defines a constant (not used in modern Java).',
    'continue': 'continue: Continues to the next iteration of a loop.',
    'default': 'default: Specifies the default block of code in a switch statement.',
    'do': 'do: Executes a block of code one time, and then repeats the loop as long as a specified condition is true.',
    'else': 'else: Executes a block of code if a specified condition is false.',
    'enum': 'enum: Declares an enumerated (unchangeable) type.',
    'extends': 'extends: Extends a class (indicates that a class is inherited from another class).',
    'final': 'final: A non-access modifier used for classes, attributes and methods, which makes them non-changeable.',
    'finally': 'finally: Executes a block of code after a try...catch structure.',
    'for': 'for: Creates a loop that executes a block of code a limited amount of times.',
    'goto': 'goto: Not used in modern Java.',
    'if': 'if: Makes a conditional statement.',
    'implements': 'implements: Implements an interface.',
    'import': 'import: Used to import a package, class or interface.',
    'instanceof': 'instanceof: Checks whether an object is an instance of a specific class or interface.',
    'interface': 'interface: Used to declare a special type of class that only contains abstract methods.',
    'native': 'native: Specifies that a method is implemented in native code using JNI.',
    'new': 'new: Creates new objects.',
    'package': 'package: Declares a package.',
    'private': 'private: An access modifier used for attributes, methods and constructors, making them only accessible within the declared class.',
    'protected': 'protected: An access modifier used for attributes, methods and constructors, making them accessible in the same package and subclasses.',
    'public': 'public: An access modifier used for classes, attributes, methods and constructors, making them accessible by any other class.',
    'return': 'return: Finishes the execution of a method, and can be used to return a value from a method.',
    'static': 'static: A non-access modifier used for methods and attributes. Static methods/attributes can be accessed without creating an instance of a class.',
    'strictfp': 'strictfp: Restricts the precision and rounding of floating point calculations.',
    'super': 'super: Refers to superclass (parent) objects.',
    'switch': 'switch: Selects one of many code blocks to be executed.',
    'synchronized': 'synchronized: A non-access modifier, which specifies that methods can only be accessed by one thread at a time.',
    'this': 'this: Refers to the current object in a method or constructor.',
    'throw': 'throw: Creates a custom error.',
    'throws': 'throws: Indicates what exceptions may be thrown by a method.',
    'transient': 'transient: A non-access modifier, which specifies that an attribute is not part of an object\'s persistent state.',
    'try': 'try: Creates a try...catch statement.',
    'volatile': 'volatile: Indicates that an attribute is not cached thread-locally, and is always read from the "main memory".',
    'while': 'while: Creates a loop that executes a block of code as long as a specified condition is true.'
  };

  if (primitiveTypes[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`java\n${word}\n\`\`\`\n\n${primitiveTypes[word]}`
      }
    };
  }

  if (commonClasses[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`java\n${word}\n\`\`\`\n\n${commonClasses[word]}`
      }
    };
  }

  if (commonMethods[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`java\n${word}()\n\`\`\`\n\n${commonMethods[word]}`
      }
    };
  }

  if (keywords[word]) {
    return {
      contents: {
        kind: 'markdown',
        value: `\`\`\`java\n${word}\n\`\`\`\n\n${keywords[word]}`
      }
    };
  }

  // Check for user-defined classes/methods in the code
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('class ') && trimmed.includes(word)) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`java\n${trimmed}\n\`\`\`\n\nClase definida por el usuario`
        }
      };
    }
    if (trimmed.includes(` ${word}(`) && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
      return {
        contents: {
          kind: 'markdown',
          value: `\`\`\`java\n${trimmed}\n\`\`\`\n\nMétodo definido por el usuario`
        }
      };
    }
  }

  return null;
}