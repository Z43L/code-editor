import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ errors: [] });
    }

    // Create a temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `temp_pyright_${Date.now()}.py`);
    
    // Write the code to the temp file
    fs.writeFileSync(tempFile, code);

    try {
      // Run pyright on the temp file
      const { stdout, stderr } = await execAsync(`npx pyright --outputjson ${tempFile}`, { cwd: process.cwd() });
      
      // Parse the JSON output
      const result = JSON.parse(stdout);
      
      // Extract diagnostics
      const errors = (result.generalDiagnostics || []).map((diag: any) => ({
        line: diag.range.start.line + 1,
        message: diag.message,
      }));

      return NextResponse.json({ errors });
    } catch (error: any) {
      // If pyright fails, try to parse stderr or return empty
      console.error('Pyright error:', error);
      return NextResponse.json({ errors: [] });
    } finally {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ errors: [] }, { status: 500 });
  }
}