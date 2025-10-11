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

    // Handle special commands
    if (command === 'clear') {
      return NextResponse.json({
        success: true,
        output: '',
        error: '',
        exitCode: 0,
        terminalId
      })
    }

    try {
      // Use exec instead of spawn for better shell compatibility
      const { stdout, stderr } = await execAsync(command, {
        cwd: cwd || process.cwd(),
        encoding: 'utf8',
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 30000, // 30 second timeout
        env: process.env
      })

      return NextResponse.json({
        success: true,
        output: stdout,
        error: stderr,
        exitCode: 0,
        terminalId
      })
    } catch (execError: any) {
      // exec throws on non-zero exit codes
      return NextResponse.json({
        success: false,
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
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}