import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

export async function POST(request: NextRequest) {
  try {
    const { command, cwd, terminalId } = await request.json()

    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 })
    }

    // Ejecutar el comando en un proceso hijo
    const child = spawn(command, {
      shell: true,
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    // Recopilar output
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    // Retornar una respuesta que indique que el comando se está ejecutando
    return new Promise((resolve) => {
      child.on('close', (code) => {
        resolve(NextResponse.json({
          success: true,
          output: stdout,
          error: stderr,
          exitCode: code,
          terminalId
        }))
      })

      child.on('error', (error) => {
        resolve(NextResponse.json({
          success: false,
          error: error.message,
          terminalId
        }, { status: 500 }))
      })
    })

  } catch (error) {
    console.error('Terminal API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}