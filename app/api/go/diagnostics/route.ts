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
      const tempDir = path.join(os.tmpdir(), 'go-lsp');
      await fs.mkdir(tempDir, { recursive: true });

      const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.go`;
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

    // Ejecutar gopls con timeout
    const diagnostics = await Promise.race([
      runGoplsDiagnostics(tempFilePath),
      new Promise<Diagnostic[]>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);

    return NextResponse.json({ diagnostics });

  } catch (error) {
    console.error('Error in Go diagnostics:', error);

    // Retornar diagnóstico de error genérico
    const diagnostics: Diagnostic[] = [{
      line: 0,
      character: 0,
      severity: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      source: 'gopls'
    }];

    return NextResponse.json({ diagnostics });
  }
}

async function runGoplsDiagnostics(filePath: string): Promise<Diagnostic[]> {
  try {
    // Ejecutar gopls check con formato JSON
    const { stdout } = await execAsync(`gopls check -json ${filePath}`, {
      timeout: 3000,
      maxBuffer: 1024 * 1024 // 1MB buffer
    });

    if (!stdout.trim()) {
      return [];
    }

    // Parsear la salida JSON de gopls
    const results = JSON.parse(stdout);

    const diagnostics: Diagnostic[] = [];

    // gopls puede retornar un array de resultados o un objeto único
    const diagnosticsArray = Array.isArray(results) ? results : [results];

    for (const result of diagnosticsArray) {
      if (result.diagnostics && Array.isArray(result.diagnostics)) {
        for (const diag of result.diagnostics) {
          diagnostics.push({
            line: diag.range?.start?.line ?? 0,
            character: diag.range?.start?.character ?? 0,
            severity: mapSeverity(diag.severity),
            message: diag.message || 'Unknown error',
            source: 'gopls',
            code: diag.code
          });
        }
      }
    }

    return diagnostics;

  } catch (error: any) {
    // Si gopls no está disponible o falla, intentar con go vet como fallback
    try {
      const { stdout: vetOutput } = await execAsync(`go vet ${filePath}`, {
        timeout: 3000
      });

      if (vetOutput.trim()) {
        // Parsear salida de go vet (formato simple)
        const lines = vetOutput.split('\n').filter(line => line.trim());
        return lines.map((line, index) => ({
          line: index,
          character: 0,
          severity: 'warning' as const,
          message: line.trim(),
          source: 'go vet'
        }));
      }
    } catch (vetError) {
      // Ignorar errores de fallback
    }

    // Si todo falla, retornar array vacío
    return [];
  }
}

function mapSeverity(severity?: string): 'error' | 'warning' | 'info' {
  switch (severity?.toLowerCase()) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'information':
    case 'info':
      return 'info';
    default:
      return 'error';
  }
}