import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const { command, cwd, terminalId } = await request.json()

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 })
    }

    // Ejecutar el comando usando exec para compatibilidad cross-platform
    const execOptions = {
      cwd: cwd || process.cwd(),
      maxBuffer: 1024 * 1024, // 1MB buffer
    }

    try {
      const { stdout, stderr } = await execAsync(command, execOptions)

      return NextResponse.json({
        success: true,
        output: stdout,
        error: stderr,
        exitCode: 0,
        terminalId
      })
    } catch (execError: any) {
      // exec lanza error cuando el comando falla
      return NextResponse.json({
        success: true, // El comando se ejecutó, solo falló
        output: execError.stdout || '',
        error: execError.stderr || execError.message,
        exitCode: execError.code || 1,
        terminalId
      })
    }

  } catch (error) {
    console.error('Terminal API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}