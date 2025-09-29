import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Cache para evitar crear archivos temporales constantemente
const tempFiles = new Map<string, { filePath: string, timestamp: number }>();
const CACHE_DURATION = 30000; // 30 segundos

// Función para limpiar archivos temporales antiguos
function cleanupOldTempFiles() {
  const now = Date.now();
  for (const [key, value] of tempFiles.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      try {
        fs.unlinkSync(value.filePath);
      } catch (e) {
        // Ignore cleanup errors
      }
      tempFiles.delete(key);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ errors: [] });
    }

    // Limpiar archivos temporales antiguos
    cleanupOldTempFiles();

    // Crear clave única para el cache
    const cacheKey = `pyright_${code.length}_${code.slice(0, 100).replace(/\s/g, '')}`;

    let tempFile: string;

    // Verificar si ya tenemos un archivo temporal para este contenido
    if (tempFiles.has(cacheKey)) {
      const cached = tempFiles.get(cacheKey)!;
      tempFile = cached.filePath;
      // Actualizar timestamp
      cached.timestamp = Date.now();
    } else {
      // Crear nuevo archivo temporal
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      tempFile = path.join(tempDir, `pyright_${timestamp}.py`);

      // Write the code to the temp file
      fs.writeFileSync(tempFile, code);

      // Cache the file path
      tempFiles.set(cacheKey, {
        filePath: tempFile,
        timestamp: Date.now()
      });
    }

    try {
      // Run pyright with timeout and better error handling
      const { stdout } = await execAsync(`npx pyright --outputjson ${tempFile}`, {
        cwd: process.cwd(),
        timeout: 5000, // 5 second timeout
        killSignal: 'SIGKILL'
      });

      // Parse the JSON output
      const result = JSON.parse(stdout);

      // Extract diagnostics with better formatting
      const errors = (result.generalDiagnostics || []).map((diag: any) => ({
        line: diag.range?.start?.line ?? 0,
        character: diag.range?.start?.character ?? 0,
        message: diag.message,
        severity: diag.severity === 'error' ? 'error' : diag.severity === 'warning' ? 'warning' : 'info',
        source: 'pyright',
        code: diag.rule
      }));

      return NextResponse.json({ errors });
    } catch (pyrightError: any) {
      // If pyright fails, try basic Python syntax check as fallback
      try {
        const { stderr } = await execAsync(`python3 -m py_compile ${tempFile}`, {
          timeout: 3000,
          killSignal: 'SIGKILL'
        });

        // If no stderr, syntax is valid
        return NextResponse.json({ errors: [] });
      } catch (compileError: any) {
        // Parse compilation errors
        const errors = (compileError.stderr || '').split('\n')
          .filter((line: string) => line.trim() && (line.includes('SyntaxError') || line.includes('IndentationError') || line.includes('error')))
          .map((line: string) => {
            // Match Python error format: File "file.py", line X, message
            const match = line.match(/File ".*?", line (\d+),?\s*(.+)/);
            if (match) {
              const [, lineNum, message] = match;
              return {
                line: parseInt(lineNum) - 1,
                character: 0,
                message: message.trim(),
                severity: 'error',
                source: 'python'
              };
            }
            return null;
          })
          .filter(Boolean);

        return NextResponse.json({ errors });
      }
    }
  } catch (error) {
    console.error('Error en API de Pyright:', error);
    return NextResponse.json({ errors: [] }, { status: 500 });
  }
}