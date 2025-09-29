import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content, position } = await request.json();

    if (!content || position === undefined) {
      return NextResponse.json({ definition: null });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_java_${Date.now()}.java`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use enhanced Java definition lookup
      const definition = await getJavaDefinition(tempFile, content, position);

      return NextResponse.json({ definition });
    } catch (error) {
      console.error('Java definition error:', error);
      return NextResponse.json({ definition: null });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Java definition Error en API:', error);
    return NextResponse.json({ definition: null });
  }
}

async function getJavaDefinition(filePath: string, content: string, position: number) {
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

      // Find definition in the current file
      const definition = findDefinitionInFile(word, content);

      resolve(definition);
    } catch (error) {
      reject(error);
    }
  });
}

function findDefinitionInFile(word: string, content: string) {
  const lines = content.split('\n');

  // Look for class definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('class ') && line.includes(word)) {
      return {
        uri: 'file://current_file.java',
        range: {
          start: { line: i, character: line.indexOf('class') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for interface definitions
    if (line.startsWith('interface ') && line.includes(word)) {
      return {
        uri: 'file://current_file.java',
        range: {
          start: { line: i, character: line.indexOf('interface') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for method definitions
    const methodMatch = line.match(/^\s*(public|private|protected|static|final|synchronized|abstract)?\s*(<\w+>)?\s*\w+\s+\w+\s*\([^)]*\)\s*\{?/);
    if (methodMatch && line.includes(`${word}(`)) {
      return {
        uri: 'file://current_file.java',
        range: {
          start: { line: i, character: 0 },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for variable declarations
    const varMatch = line.match(new RegExp(`^\\s*(public|private|protected|static|final)?\\s*\\w+\\s+(${word})\\s*[;=]`));
    if (varMatch) {
      return {
        uri: 'file://current_file.java',
        range: {
          start: { line: i, character: line.indexOf(word) },
          end: { line: i, character: line.indexOf(word) + word.length }
        }
      };
    }

    // Look for field declarations
    const fieldMatch = line.match(new RegExp(`^\\s*(public|private|protected|static|final)?\\s*\\w+\\s+${word}\\s*[;=]`));
    if (fieldMatch) {
      return {
        uri: 'file://current_file.java',
        range: {
          start: { line: i, character: line.indexOf(word) },
          end: { line: i, character: line.indexOf(word) + word.length }
        }
      };
    }
  }

  // Built-in definitions (would normally be handled by LSP)
  const builtinDefinitions: { [key: string]: any } = {
    'String': {
      uri: 'java://java.lang.String',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'Object': {
      uri: 'java://java.lang.Object',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'Integer': {
      uri: 'java://java.lang.Integer',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'Double': {
      uri: 'java://java.lang.Double',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'Boolean': {
      uri: 'java://java.lang.Boolean',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'ArrayList': {
      uri: 'java://java.util.ArrayList',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 }
      }
    },
    'HashMap': {
      uri: 'java://java.util.HashMap',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'HashSet': {
      uri: 'java://java.util.HashSet',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'System': {
      uri: 'java://java.lang.System',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'Math': {
      uri: 'java://java.lang.Math',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'Arrays': {
      uri: 'java://java.util.Arrays',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'Collections': {
      uri: 'java://java.util.Collections',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 }
      }
    },
    'Scanner': {
      uri: 'java://java.util.Scanner',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'PrintWriter': {
      uri: 'java://java.io.PrintWriter',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 }
      }
    },
    'File': {
      uri: 'java://java.io.File',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'Exception': {
      uri: 'java://java.lang.Exception',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 }
      }
    },
    'RuntimeException': {
      uri: 'java://java.lang.RuntimeException',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 15 }
      }
    },
    'IOException': {
      uri: 'java://java.io.IOException',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 }
      }
    },
    'NullPointerException': {
      uri: 'java://java.lang.NullPointerException',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 19 }
      }
    }
  };

  return builtinDefinitions[word] || null;
}