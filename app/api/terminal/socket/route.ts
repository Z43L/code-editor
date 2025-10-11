import { NextRequest } from 'next/server'
import { spawn } from 'child_process'

// Simple SSE endpoint for terminal output streaming
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const terminalId = searchParams.get('terminalId')

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder()
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          terminalId,
          message: 'SSE connection established'
        })}\n\n`)
      )

      // Simulate real-time output (this would be replaced with actual command output)
      setTimeout(() => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'output',
            terminalId,
            data: 'Terminal SSE connection established\n'
          })}\n\n`)
        )
      }, 100)

      // Keep connection alive
      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(':\n\n'))
      }, 15000)

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        clearInterval(interval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  })
}

// POST endpoint for executing commands via SSE
export async function POST(request: NextRequest) {
  try {
    const { command, cwd, terminalId } = await request.json()

    if (!command) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Command is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const [cmd, ...args] = command.trim().split(' ')

    return new Promise((resolve) => {
      let output = ''
      let errorOutput = ''

      const childProcess = spawn(cmd, args, {
        cwd: cwd || process.cwd(),
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      childProcess.stdout?.on('data', (data) => {
        output += data.toString()
      })

      childProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString()
      })

      childProcess.on('close', (code) => {
        resolve(
          new Response(JSON.stringify({
            success: true,
            output,
            error: errorOutput,
            exitCode: code,
            terminalId
          }), {
            headers: { 'Content-Type': 'application/json' }
          })
        )
      })

      childProcess.on('error', (error) => {
        resolve(
          new Response(JSON.stringify({
            success: false,
            error: error.message
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          })
        )
      })
    })
  } catch (error) {
    console.error('Terminal API error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}