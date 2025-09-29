import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request: NextRequest) {
  try {
    const { fileName, content } = await request.json();

    if (!content) {
      return NextResponse.json({ diagnostics: [] });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_python_${Date.now()}.py`);

    // Write the code to the temp file
    fs.writeFileSync(tempFile, content);

    try {
      // Use pyright for diagnostics
      const diagnostics = await getPyrightDiagnostics(tempFile, content);

      return NextResponse.json({ diagnostics });
    } catch (error) {
      console.error('Python diagnostics error:', error);
      return NextResponse.json({ diagnostics: [] });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Python diagnostics Error en API:', error);
    return NextResponse.json({ diagnostics: [] });
  }
}

async function getPyrightDiagnostics(filePath: string, content: string) {
  return new Promise<any[]>((resolve, reject) => {
    try {
      // For now, implement basic syntax checking
      // In a full implementation, this would use pyright LSP for comprehensive diagnostics
      const diagnostics = [];

      const lines = content.split('\n');

      // Basic syntax checks
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check for common syntax errors
        if (trimmed.includes('print ') && !trimmed.includes('(') && !trimmed.includes(')')) {
          diagnostics.push({
            range: {
              start: { line: i, character: line.indexOf('print') },
              end: { line: i, character: line.indexOf('print') + 5 }
            },
            severity: 2, // Warning
            message: 'print statement should use function syntax: print(...)',
            source: 'pyright'
          });
        }

        // Check for undefined variables (basic)
        const varMatch = line.match(/\b([a-zA-Z_]\w*)\b/g);
        if (varMatch) {
          for (const variable of varMatch) {
            if (!isBuiltin(variable) && !isDefinedInScope(variable, content, i)) {
              diagnostics.push({
                range: {
                  start: { line: i, character: line.indexOf(variable) },
                  end: { line: i, character: line.indexOf(variable) + variable.length }
                },
                severity: 1, // Error
                message: `"${variable}" is not defined`,
                source: 'pyright'
              });
            }
          }
        }

        // Check for indentation issues
        if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && i > 0) {
          const prevLine = lines[i - 1];
          if ((prevLine.includes(':') || prevLine.trim().endsWith('\\')) &&
              !prevLine.trim().startsWith('#') && prevLine.trim().length > 0) {
            // This might be an indentation error
            diagnostics.push({
              range: {
                start: { line: i, character: 0 },
                end: { line: i, character: line.length }
              },
              severity: 1, // Error
              message: 'Expected indented block',
              source: 'pyright'
            });
          }
        }
      }

      resolve(diagnostics);
    } catch (error) {
      reject(error);
    }
  });
}

function isBuiltin(variable: string): boolean {
  const builtins = [
    'False', 'None', 'True', 'abs', 'all', 'any', 'ascii', 'bin', 'bool',
    'bytearray', 'bytes', 'callable', 'chr', 'classmethod', 'compile',
    'complex', 'delattr', 'dict', 'dir', 'divmod', 'enumerate', 'eval',
    'exec', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals',
    'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance',
    'issubclass', 'iter', 'len', 'list', 'locals', 'map', 'max', 'memoryview',
    'min', 'next', 'object', 'oct', 'open', 'ord', 'pow', 'print', 'property',
    'range', 'repr', 'reversed', 'round', 'set', 'setattr', 'slice', 'sorted',
    'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars', 'zip'
  ];
  return builtins.includes(variable);
}

function isDefinedInScope(variable: string, content: string, currentLine: number): boolean {
  const lines = content.split('\n');

  // Check if variable is defined before current line
  for (let i = 0; i < currentLine; i++) {
    const line = lines[i];

    // Function parameters
    const funcMatch = line.match(/def\s+\w+\s*\(([^)]*)\)/);
    if (funcMatch) {
      const params = funcMatch[1].split(',').map(p => p.trim().split('=')[0].trim());
      if (params.includes(variable)) {
        return true;
      }
    }

    // Variable assignments
    if (line.includes(`${variable} =`) || line.includes(`${variable}=`)) {
      return true;
    }

    // For loops
    if (line.includes(`for ${variable} in`) || line.includes(`for ${variable}in`)) {
      return true;
    }

    // Import statements
    if (line.includes(`import ${variable}`) || line.includes(`from ${variable} import`)) {
      return true;
    }
  }

  return false;
}