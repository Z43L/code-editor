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

interface Diagnostic {
  line: number;
  character: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  code?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { fileName, content } = await request.json();

    if (!content || !fileName) {
      return NextResponse.json({ diagnostics: [] });
    }

    // Verificar si tenemos un archivo en cache válido
    const cacheKey = `${fileName}:${content.length}`;
    const cached = tempFileCache.get(cacheKey);
    const now = Date.now();

    let tempFilePath: string;
    if (cached && (now - cached.timestamp) < CACHE_DURATION && cached.content === content) {
      tempFilePath = cached.tempPath;
    } else {
      // Crear archivo temporal
      const tempDir = path.join(os.tmpdir(), 'java-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.java`;
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

    // Ejecutar javac con timeout
    const diagnostics = await Promise.race([
      runJavacDiagnostics(tempFilePath),
      new Promise<Diagnostic[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);

    return NextResponse.json({ diagnostics });

  } catch (error) {
    console.error('Error in Java diagnostics:', error);

    // Retornar diagnóstico de error genérico
    const diagnostics: Diagnostic[] = [{
      line: 0,
      character: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'javac'
    }];

    return NextResponse.json({ diagnostics });
  }
}

async function runJavacDiagnostics(filePath: string): Promise<Diagnostic[]> {
  try {
    // Ejecutar javac con opciones para obtener errores detallados
    const { stdout, stderr } = await execAsync(`javac -Xmaxerrs 10 -Xmaxwarns 10 ${filePath}`, {
      timeout: 3000,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });

    // javac escribe errores en stderr
    const output = stderr || stdout;
    if (!output.trim()) {
      return [];
    }

    // Parsear la salida de javac
    const lines = output.split('\n').filter(line => line.trim());
    const diagnostics: Diagnostic[] = [];

    for (const line of lines) {
      // Formato típico: "file.java:line:column: error/warning: message"
      const match = line.match(/^(.+?\.java):(\d+):(\d+):\s*(error|warning|note):\s*(.+)$/);
      if (match) {
        const [, , lineNum, charNum, severity, message] = match;
        diagnostics.push({
          line: parseInt(lineNum) - 1, // Convertir a 0-based
          character: parseInt(charNum) - 1, // Convertir a 0-based
          severity: severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info',
          message: message.trim(),
          source: 'javac'
        });
      } else if (line.includes('error') || line.includes('warning')) {
        // Fallback para líneas que contienen errores pero no siguen el formato exacto
        diagnostics.push({
          line: 0,
          character: 0,
          severity: line.includes('error') ? 'error' : 'warning',
          message: line.trim(),
          source: 'javac'
        });
      }
    }

    return diagnostics;

  } catch (error: any) {
    // Si javac falla completamente, intentar detectar errores básicos de sintaxis
    try {
      // Verificar sintaxis básica leyendo el archivo
      const content = await fs.readFile(filePath, 'utf8');

      // Detección básica de errores comunes
      const basicDiagnostics: Diagnostic[] = [];

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detectar llaves sin cerrar (muy básico)
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        if (openBraces > closeBraces + 1) { // Permitir un desbalance por línea
          basicDiagnostics.push({
            line: i,
            character: 0,
            severity: 'warning',
            message: 'Possible missing closing brace',
            source: 'basic-parser'
          });
        }

        // Detectar paréntesis sin cerrar
        const openParens = (line.match(/\(/g) || []).length;
        const closeParens = (line.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          basicDiagnostics.push({
            line: i,
            character: 0,
            severity: 'warning',
            message: 'Mismatched parentheses',
            source: 'basic-parser'
          });
        }
      }

      return basicDiagnostics;
    } catch (fallbackError) {
      // Si todo falla, retornar array vacío
      return [];
    }
  }
}