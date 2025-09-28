import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { code, fileName = 'main.cpp' } = await request.json();

    if (!code) {
      return NextResponse.json({ errors: [] });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_clangd_${Date.now()}_${fileName}`);
    const compileCommands = path.join(tempDir, 'compile_commands.json');

    // Write the code to the temp file
    fs.writeFileSync(tempFile, code);

    // Create a basic compile_commands.json for clangd
    const compileCommandsContent = JSON.stringify([{
      directory: tempDir,
      command: `clang++ -std=c++17 -I. ${tempFile}`,
      file: tempFile
    }]);
    fs.writeFileSync(compileCommands, compileCommandsContent);

    try {
      // Try to run clangd diagnostics
      // First check if clangd is available
      await execAsync('which clangd');

      // Run clangd to get diagnostics
      // This is a simplified approach - in production you'd use LSP
      const { stdout } = await execAsync(`clangd --check=${tempFile}`, {
        cwd: tempDir,
        env: { ...process.env, CLANGD_FLAGS: `--compile-commands-dir=${tempDir}` }
      });

      // Parse clangd output (simplified)
      const errors = [];
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('error') || line.includes('warning')) {
          // Simple parsing - in production use proper LSP
          const match = line.match(/(\d+):(\d+):\s*(error|warning):\s*(.+)/);
          if (match) {
            errors.push({
              line: parseInt(match[1]),
              message: match[4]
            });
          }
        }
      }

      return NextResponse.json({ errors });
    } catch (error: any) {
      // If clangd fails or is not available, try basic clang compilation
      try {
        const { stderr } = await execAsync(`clang++ -fsyntax-only -std=c++17 ${tempFile}`, { cwd: tempDir });
        const errors = stderr.split('\n')
          .filter(line => line.includes('error') || line.includes('warning'))
          .map(line => {
            const match = line.match(/:(\d+):\d+:\s*(.+)/);
            return match ? {
              line: parseInt(match[1]),
              message: match[2]
            } : null;
          })
          .filter(Boolean);

        return NextResponse.json({ errors });
      } catch (compileError: any) {
        // Parse compilation errors
        const errors = compileError.stderr?.split('\n')
          .filter((line: string) => line.includes('error') || line.includes('warning'))
          .map((line: string) => {
            const match = line.match(/:(\d+):\d+:\s*(.+)/);
            return match ? {
              line: parseInt(match[1]),
              message: match[2]
            } : null;
          })
          .filter(Boolean) || [];

        return NextResponse.json({ errors });
      }
    } finally {
      // Clean up temp files
      try {
        fs.unlinkSync(tempFile);
        fs.unlinkSync(compileCommands);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ errors: [] }, { status: 500 });
  }
}