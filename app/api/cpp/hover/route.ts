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
    const fileName = body.fileName || 'temp.cpp';

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
      const tempDir = path.join(os.tmpdir(), 'cpp-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.cpp`;
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
      runCppHover(content, line, character, tempFilePath, position),
      new Promise<HoverInfo | null>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);

    return NextResponse.json({ hover });

  } catch (error) {
    console.error('Error en hover de C++:', error);

    // Fallback a hover básico
    const basicHover = getBasicCppHover(content, position);
    return NextResponse.json({ hover: basicHover });
  }
}

async function runCppHover(content: string, line: number, character: number, filePath: string, position: number): Promise<HoverInfo | null> {
  try {
    console.log('Iniciando clangd LSP para hover...');

    // Usar clangd para obtener información de hover
    const { spawn } = require('child_process');

    // Crear archivo temporal para el servidor
    const tempDir = path.dirname(filePath);

    // Inicializar servidor clangd
    const server = spawn('clangd', ['--log=verbose', '--pretty'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: tempDir
    });

    let responseData = '';
    let requestId = 1;

    // Función helper para enviar mensajes LSP
    const sendMessage = (message: any) => {
      const json = JSON.stringify(message);
      const contentLength = Buffer.byteLength(json, 'utf8');
      const fullMessage = `Content-Length: ${contentLength}\r\n\r\n${json}`;
      console.log('Enviando mensaje LSP:', message.method || 'response');
      server.stdin.write(fullMessage);
    };

    // Promesa para esperar la respuesta
    const hoverPromise = new Promise<HoverInfo | null>((resolve, reject) => {
      server.stdout.on('data', (data: Buffer) => {
        responseData += data.toString();

        // Procesar mensajes LSP (formato Content-Length)
        // Buscar todos los mensajes Content-Length en la respuesta acumulada
        const contentLengthRegex = /Content-Length: (\d+)\r\n\r\n/g;
        let match;

        while ((match = contentLengthRegex.exec(responseData)) !== null) {
          try {
            const contentLength = parseInt(match[1]);
            const jsonStart = match.index + match[0].length;
            const jsonContent = responseData.substring(jsonStart, jsonStart + contentLength);

            // Verificar que tenemos suficientes datos
            if (responseData.length >= jsonStart + contentLength) {
              const response = JSON.parse(jsonContent.trim());
              console.log('Respuesta LSP parseada:', response);

              if (response.id === requestId && response.result !== undefined) {
                const result = response.result;
                if (result && result.contents) {
                  resolve({
                    contents: formatHoverContents(result.contents),
                    range: result.range
                  });
                } else {
                  resolve(null);
                }
                return;
              }
            }
          } catch (e) {
            console.error('Error parseando respuesta LSP:', e);
            // Continuar procesando otros mensajes
          }
        }
      });

      server.stderr.on('data', (data: Buffer) => {
        const stderrData = data.toString();
        // Solo loggear errores reales, no logs informativos
        if (stderrData.includes('Error') || stderrData.includes('error') || stderrData.includes('failed')) {
          console.error('Error de clangd stderr:', stderrData);
        }
      });

      server.on('close', (code: number) => {
        console.log('Servidor clangd cerrado con código:', code);
        reject(new Error('Servidor LSP cerrado'));
      });

      setTimeout(() => {
        reject(new Error('Timeout esperando respuesta LSP'));
      }, 5000); // Aumentado de 3000ms a 5000ms
    });

    // Enviar inicialización
    sendMessage({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        processId: process.pid,
        rootPath: tempDir,
        rootUri: `file://${tempDir}`,
        capabilities: {
          textDocument: {
            hover: {
              dynamicRegistration: true,
              contentFormat: ['markdown', 'plaintext']
            }
          }
        }
      }
    });

    // Esperar inicialización y enviar initialized
    await new Promise(resolve => setTimeout(resolve, 500));

    sendMessage({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    });

    // Abrir el documento
    sendMessage({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: `file://${filePath}`,
          languageId: 'cpp',
          version: 1,
          text: content
        }
      }
    });

    // Esperar un poco para que el documento se procese
    await new Promise(resolve => setTimeout(resolve, 200));

    // Enviar solicitud de hover
    sendMessage({
      jsonrpc: '2.0',
      id: requestId++,
      method: 'textDocument/hover',
      params: {
        textDocument: {
          uri: `file://${filePath}`
        },
        position: {
          line: line,
          character: character
        }
      }
    });

    const result = await hoverPromise;

    server.kill();

    return result;

  } catch (lspError) {
    console.log('LSP no disponible, usando hover básico:', lspError instanceof Error ? lspError.message : String(lspError));
    // Fallback a hover básico
    return getBasicCppHover(content, position);
  }
}

function formatHoverContents(contents: any): string | { kind: string; value: string }[] {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents.map(item => {
      if (typeof item === 'string') {
        return { kind: 'plaintext', value: item };
      }
      return {
        kind: item.kind || 'plaintext',
        value: item.value || item
      };
    });
  }

  if (contents.value) {
    return contents.value;
  }

  return 'Información no disponible';
}

function getBasicCppHover(content: string, position: number): HoverInfo | null {
  // Calcular línea y carácter desde la posición
  const lines = content.substring(0, position).split('\n');
  const line = lines.length - 1;
  const character = lines[lines.length - 1].length;
  const currentLine = lines[line] || '';

  console.log('Basic hover - position:', position, 'line:', line, 'character:', character, 'currentLine:', JSON.stringify(currentLine));

  // Forzar hover de prueba para debugging - mostrar siempre algo
  return {
    contents: `**Información de hover C++**\n\nPosición: ${position}\nLínea: ${line}\nCarácter: ${character}\nContenido de línea: \`${currentLine}\`\n\n*Hover básico funcionando*`,
    range: {
      start: { line, character: Math.max(0, character - 5) },
      end: { line, character: Math.min(currentLine.length, character + 5) }
    }
  };
}

function getCppKeywordDocumentation(keyword: string): string {
  const docs: { [key: string]: string } = {
    'int': 'Tipo de dato entero con signo\n\nOcupa 4 bytes en la mayoría de sistemas. Rango: -2,147,483,648 a 2,147,483,647',
    'void': 'Tipo que indica ausencia de valor\n\nSe usa para funciones que no retornan valor o punteros genéricos',
    'char': 'Tipo de dato para caracteres\n\nOcupa 1 byte. Puede contener valores ASCII o Unicode',
    'float': 'Tipo de dato de punto flotante de precisión simple\n\nOcupa 4 bytes. Precisión aproximada de 7 dígitos decimales',
    'double': 'Tipo de dato de punto flotante de doble precisión\n\nOcupa 8 bytes. Precisión aproximada de 15 dígitos decimales',
    'bool': 'Tipo de dato booleano\n\nPuede contener true o false',
    'auto': 'Deducción automática de tipo\n\nEl compilador deduce el tipo de la variable a partir del valor inicial',
    'const': 'Calificador de constante\n\nIndica que el valor no puede ser modificado después de la inicialización',
    'static': 'Almacenamiento estático\n\nLa variable mantiene su valor entre llamadas a la función',
    'class': 'Definición de clase\n\nPermite crear tipos de datos personalizados con miembros y métodos',
    'struct': 'Estructura de datos\n\nSimilar a class pero con miembros públicos por defecto',
    'public': 'Especificador de acceso público\n\nLos miembros son accesibles desde cualquier parte',
    'private': 'Especificador de acceso privado\n\nLos miembros solo son accesibles desde la propia clase',
    'protected': 'Especificador de acceso protegido\n\nLos miembros son accesibles desde la clase y sus derivadas',
    'virtual': 'Función virtual\n\nPermite polimorfismo en tiempo de ejecución',
    'override': 'Sobrescritura explícita\n\nIndica que una función sobrescribe una función virtual de la clase base',
    'if': 'Sentencia condicional\n\nEjecuta código si la condición es verdadera',
    'else': 'Parte alternativa del if\n\nSe ejecuta cuando la condición del if es falsa',
    'for': 'Bucle con contador\n\nRepite la ejecución mientras se cumple una condición',
    'while': 'Bucle condicional\n\nRepite la ejecución mientras la condición sea verdadera',
    'do': 'Bucle do-while\n\nSimilar al while pero se ejecuta al menos una vez',
    'switch': 'Selección múltiple\n\nPermite elegir entre múltiples opciones basadas en un valor',
    'case': 'Caso en switch\n\nDefine una opción específica en una sentencia switch',
    'default': 'Caso por defecto en switch\n\nSe ejecuta si ningún case coincide',
    'break': 'Salir de bucle o switch\n\nTermina la ejecución del bucle o switch actual',
    'continue': 'Continuar con la siguiente iteración\n\nSalta a la siguiente iteración del bucle',
    'return': 'Retornar valor de función\n\nDevuelve un valor y termina la función',
    'try': 'Bloque de manejo de excepciones\n\nIntenta ejecutar código que puede lanzar excepciones',
    'catch': 'Captura de excepciones\n\nManeja excepciones lanzadas en el bloque try',
    'throw': 'Lanzar excepción\n\nEnvía una señal de error que puede ser capturada',
    'new': 'Asignación dinámica de memoria\n\nCrea un objeto en el heap y retorna un puntero',
    'delete': 'Liberación de memoria dinámica\n\nDestruye un objeto creado con new',
    'sizeof': 'Tamaño de tipo o variable\n\nRetorna el tamaño en bytes del tipo o variable',
    'typedef': 'Alias de tipo\n\nCrea un nombre alternativo para un tipo existente',
    'using': 'Declaración using\n\nImporta nombres de espacios de nombres o crea alias',
    'namespace': 'Espacio de nombres\n\nAgrupa código para evitar conflictos de nombres',
    'template': 'Plantilla de función o clase\n\nPermite crear código genérico parametrizado por tipos',
    'typename': 'Especificador de tipo en plantillas\n\nIndica que un parámetro es un tipo',
    'include': 'Directiva de inclusión\n\nIncluye el contenido de un archivo de cabecera'
  };
  return docs[keyword] || `Palabra clave de C++: ${keyword}`;
}

function getCppTypeDocumentation(type: string): string {
  const docs: { [key: string]: string } = {
    'std::string': 'Cadena de caracteres de la biblioteca estándar\n\nClase que representa secuencias de caracteres con operaciones completas de manipulación',
    'std::vector': 'Contenedor dinámico de secuencia\n\nArray dinámico que puede cambiar de tamaño automáticamente',
    'std::map': 'Contenedor asociativo ordenado\n\nAlmacena pares clave-valor ordenados por clave',
    'std::set': 'Contenedor de valores únicos ordenados\n\nAlmacena valores únicos en orden ascendente',
    'std::pair': 'Par de valores\n\nAlmacena dos valores heterogéneos como una sola unidad',
    'std::unique_ptr': 'Puntero único inteligente\n\nGestiona la propiedad exclusiva de un objeto en el heap',
    'std::shared_ptr': 'Puntero compartido inteligente\n\nPermite compartir la propiedad de un objeto entre múltiples punteros',
    'std::weak_ptr': 'Puntero débil inteligente\n\nObserva un objeto gestionado por shared_ptr sin aumentar el contador de referencias',
    'std::function': 'Envoltorio para objetos función\n\nPuede almacenar cualquier tipo de objeto invocable'
  };
  return docs[type] || `Tipo de la biblioteca estándar: ${type}`;
}

function getCppFunctionDocumentation(func: string): string {
  const docs: { [key: string]: string } = {
    'printf': 'Función de salida formateada\n\nImprime texto formateado a stdout\n\n```cpp\nprintf("Hello %s", name);\n```',
    'scanf': 'Función de entrada formateada\n\nLee datos formateados desde stdin\n\n```cpp\nscanf("%d", &value);\n```',
    'cout': 'Flujo de salida estándar\n\nObjeto global para salida de datos\n\n```cpp\nstd::cout << "Hello" << std::endl;\n```',
    'cin': 'Flujo de entrada estándar\n\nObjeto global para entrada de datos\n\n```cpp\nint x; std::cin >> x;\n```',
    'endl': 'Manipulador de fin de línea\n\nInserta un salto de línea y vacía el buffer\n\n```cpp\nstd::cout << "Hello" << std::endl;\n```',
    'std::cout': 'Flujo de salida estándar\n\nObjeto global para salida de datos\n\n```cpp\nstd::cout << "Hello" << std::endl;\n```',
    'std::cin': 'Flujo de entrada estándar\n\nObjeto global para entrada de datos\n\n```cpp\nint x; std::cin >> x;\n```',
    'std::endl': 'Manipulador de fin de línea\n\nInserta un salto de línea y vacía el buffer\n\n```cpp\nstd::cout << "Hello" << std::endl;\n```'
  };
  return docs[func] || `Función de biblioteca estándar: ${func}`;
}