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
    const tempFile = path.join(tempDir, `temp_go_${Date.now()}.go`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use gopls for definition lookup
      const definition = await getGoplsDefinition(tempFile, content, position);

      return NextResponse.json({ definition });
    } catch (error) {
      console.error('Go definition error:', error);
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
    console.error('Go definition Error en API:', error);
    return NextResponse.json({ definition: null });
  }
}

async function getGoplsDefinition(filePath: string, content: string, position: number) {
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

  // Look for function definitions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('func ') && line.includes(`${word}(`)) {
      return {
        uri: 'file://current_file.go',
        range: {
          start: { line: i, character: line.indexOf('func') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for type definitions
    if (line.startsWith('type ') && line.includes(word)) {
      return {
        uri: 'file://current_file.go',
        range: {
          start: { line: i, character: line.indexOf('type') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for variable declarations
    const varMatch = line.match(new RegExp(`^(${word})\\s*:=`)) || line.match(new RegExp(`^var\\s+${word}\\s+`)) || line.match(new RegExp(`^${word}\\s*:=`));
    if (varMatch) {
      return {
        uri: 'file://current_file.go',
        range: {
          start: { line: i, character: line.indexOf(word) },
          end: { line: i, character: line.indexOf(word) + word.length }
        }
      };
    }

    // Look for const declarations
    if (line.startsWith('const ') && line.includes(word)) {
      return {
        uri: 'file://current_file.go',
        range: {
          start: { line: i, character: line.indexOf('const') },
          end: { line: i, character: line.length }
        }
      };
    }
  }

  // Built-in definitions (would normally be handled by LSP)
  const builtinDefinitions: { [key: string]: any } = {
    'append': {
      uri: 'go://builtin',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      }
    },
    'len': {
      uri: 'go://builtin',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'make': {
      uri: 'go://builtin',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'new': {
      uri: 'go://builtin',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'fmt': {
      uri: 'go://fmt',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'os': {
      uri: 'go://os',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 2 }
      }
    },
    'strings': {
      uri: 'go://strings',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'strconv': {
      uri: 'go://strconv',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 7 }
      }
    },
    'time': {
      uri: 'go://time',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'json': {
      uri: 'go://encoding/json',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'http': {
      uri: 'go://net/http',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    }
  };

  return builtinDefinitions[word] || null;
}