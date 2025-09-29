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
    const tempFile = path.join(tempDir, `temp_python_${Date.now()}.py`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use pyright for definition lookup
      const definition = await getPyrightDefinition(tempFile, content, position);

      return NextResponse.json({ definition });
    } catch (error) {
      console.error('Python definition error:', error);
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
    console.error('Python definition Error en API:', error);
    return NextResponse.json({ definition: null });
  }
}

async function getPyrightDefinition(filePath: string, content: string, position: number) {
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
    if (line.startsWith('def ') && line.includes(`${word}(`)) {
      return {
        uri: 'file://current_file.py',
        range: {
          start: { line: i, character: line.indexOf('def') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for class definitions
    if (line.startsWith('class ') && line.includes(word)) {
      return {
        uri: 'file://current_file.py',
        range: {
          start: { line: i, character: line.indexOf('class') },
          end: { line: i, character: line.length }
        }
      };
    }

    // Look for variable assignments
    const varMatch = line.match(new RegExp(`^(${word})\\s*=`));
    if (varMatch) {
      return {
        uri: 'file://current_file.py',
        range: {
          start: { line: i, character: line.indexOf(word) },
          end: { line: i, character: line.indexOf(word) + word.length }
        }
      };
    }
  }

  // Built-in definitions (would normally be handled by LSP)
  const builtinDefinitions: { [key: string]: any } = {
    'print': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 }
      }
    },
    'len': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'str': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'int': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 3 }
      }
    },
    'list': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    },
    'dict': {
      uri: 'python://builtins',
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 4 }
      }
    }
  };

  return builtinDefinitions[word] || null;
}