import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Cache para evitar crear archivos temporales constantemente
const tempFiles = new Map<string, { filePath: string, compileCommandsPath: string, timestamp: number }>();
const CACHE_DURATION = 30000; // 30 segundos

interface ClangdError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  severity?: string;
}

// Función para limpiar archivos temporales antiguos
function cleanupOldTempFiles() {
  const now = Date.now();
  for (const [key, value] of tempFiles.entries()) {
    if (now - value.timestamp > CACHE_DURATION) {
      try {
        fs.unlinkSync(value.filePath);
        fs.unlinkSync(value.compileCommandsPath);
      } catch (e) {
        // Ignore cleanup errors
      }
      tempFiles.delete(key);
    }
  }
}

// Función para ejecutar diagnósticos con clangd
async function runClangdDiagnostics(filePath: string, compileCommandsPath: string, fileName: string): Promise<ClangdError[]> {
  const errors: ClangdError[] = [];

  try {
    // Intentar compilar con clang++ para obtener errores de sintaxis
    const command = `clang++ -fsyntax-only -std=c++17 -I. "${filePath}" 2>&1 || true`;

    console.log('Ejecutando comando clang++:', command);

    const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
    const output = stdout + stderr;

    console.log('Salida de clang++:', output);

    // Parsear errores de clang++
    const lines = output.split('\n');
    for (const line of lines) {
      // Buscar líneas que contengan errores (formato típico: file:line:col: error: message)
      const errorMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/);
      if (errorMatch) {
        const [, file, lineStr, colStr, severity, message] = errorMatch;
        errors.push({
          message: `${severity}: ${message}`,
          file: path.basename(file),
          line: parseInt(lineStr),
          column: parseInt(colStr),
          severity: severity
        });
      }
    }

  } catch (error) {
    console.error('Error ejecutando clang++:', error);
    // En caso de error, intentar con gcc como fallback
    try {
      const command = `gcc -fsyntax-only -std=c11 -I. "${filePath}" 2>&1 || true`;
      const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
      const output = stdout + stderr;

      const lines = output.split('\n');
      for (const line of lines) {
        const errorMatch = line.match(/^(.+?):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/);
        if (errorMatch) {
          const [, file, lineStr, colStr, severity, message] = errorMatch;
          errors.push({
            message: `${severity}: ${message}`,
            file: path.basename(file),
            line: parseInt(lineStr),
            column: parseInt(colStr),
            severity: severity
          });
        }
      }
    } catch (gccError) {
      console.error('Error ejecutando gcc también:', gccError);
      errors.push({
        message: 'Error ejecutando compiladores C/C++. Verifica que clang++ o gcc estén instalados.',
        line: 1,
        severity: 'error'
      });
    }
  }
      return errors;
}

export async function POST(request: NextRequest) {
  try {
    const { code, fileName } = await request.json();

    if (!code) {
      return NextResponse.json({ errors: [] });
    }

    // Limpiar archivos temporales antiguos
    cleanupOldTempFiles();

    // Crear hash del código para cache
    const crypto = require('crypto');
    const codeHash = crypto.createHash('md5').update(code).digest('hex');
    const cacheKey = `${fileName}_${codeHash}`;

    // Verificar cache
    const cached = tempFiles.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      // Usar archivos cacheados
      const { filePath, compileCommandsPath } = cached;
      const errors = await runClangdDiagnostics(filePath, compileCommandsPath, fileName);
      return NextResponse.json({ errors });
    }

    // Crear archivos temporales
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`);
    const compileCommandsPath = path.join(tempDir, 'compile_commands.json');

    // Escribir código a archivo temporal
    fs.writeFileSync(filePath, code);

    // Crear compile_commands.json básico
    const compileCommands = [{
      directory: tempDir,
      command: `clang++ -std=c++17 -I. ${fileName}`,
      file: fileName
    }];
    fs.writeFileSync(compileCommandsPath, JSON.stringify(compileCommands, null, 2));

    // Cachear archivos
    tempFiles.set(cacheKey, {
      filePath,
      compileCommandsPath,
      timestamp: Date.now()
    });

    // Ejecutar diagnóstico con clangd
    const errors = await runClangdDiagnostics(filePath, compileCommandsPath, fileName);

    return NextResponse.json({ errors });
  } catch (error) {
    console.error('Clangd diagnostics Error en API:', error);
    return NextResponse.json({ errors: [] });
  }
}