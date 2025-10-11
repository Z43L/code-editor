import { NextRequest } from 'next/server'
import * as pty from 'node-pty'
import * as os from 'os'

// Store active PTY sessions
const sessions = new Map<string, pty.IPty>()

// GET endpoint for WebSocket-like SSE connection with PTY
export async function GET(request: NextRequest) {
  console.log('[PTY GET] ========== NEW GET REQUEST ==========')
  const { searchParams } = new URL(request.url)
  const terminalId = searchParams.get('terminalId') || 'default'
  const cwd = searchParams.get('cwd') || process.cwd()

  console.log('[PTY GET] Request params:', { terminalId, cwd })
  console.log('[PTY GET] Sessions BEFORE creation:', Array.from(sessions.keys()))

  // Determine shell based on OS and configure with minimal settings
  const userShell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'
  console.log('[PTY GET] User shell:', userShell)

  // Prepare environment with simplified prompt
  const env = {
    ...(process.env as { [key: string]: string }),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    // Force simple prompt for both bash and zsh
    PS1: '$ ',
    PROMPT: '$ ',
    // Disable special zsh features
    PROMPT_EOL_MARK: '',
    PROMPT_SP: ''
  }

  // Use default shell with normal config files
  console.log('[PTY GET] Shell command:', userShell)
  console.log('[PTY GET] Creating PTY process...')

  // Create PTY process - empty array for args means load normal config
  const ptyProcess = pty.spawn(userShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd,
    env: env
  })

  // Store session
  sessions.set(terminalId, ptyProcess)
  console.log('[PTY GET] ✅ Session stored successfully')
  console.log('[PTY GET] Sessions AFTER creation:', Array.from(sessions.keys()))
  console.log('[PTY GET] Total sessions:', sessions.size)

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let isClosed = false
      let keepAliveInterval: NodeJS.Timeout | null = null

      const safeEnqueue = (data: Uint8Array) => {
        if (!isClosed) {
          try {
            controller.enqueue(data)
          } catch (error) {
            console.error('Error enqueueing data:', error)
            isClosed = true
          }
        }
      }

      const cleanup = () => {
        console.log(`[PTY GET] Cleanup called for ${terminalId}, isClosed: ${isClosed}`)
        if (isClosed) return
        isClosed = true

        if (keepAliveInterval) {
          clearInterval(keepAliveInterval)
          keepAliveInterval = null
        }

        if (sessions.has(terminalId)) {
          console.log(`[PTY GET] ❌ DELETING session ${terminalId}`)
          ptyProcess.kill()
          sessions.delete(terminalId)
          console.log('[PTY GET] Sessions after deletion:', Array.from(sessions.keys()))
        }

        try {
          controller.close()
        } catch (error) {
          // Controller already closed, ignore
        }
      }

      // Send initial connection message
      console.log(`[PTY GET] Sending 'connected' message for ${terminalId}`)
      safeEnqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          terminalId,
          message: 'PTY connection established'
        })}\n\n`)
      )

      // Listen to PTY output
      ptyProcess.onData((data) => {
        console.log(`[PTY GET] PTY output for ${terminalId}:`, data.slice(0, 50))
        safeEnqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'output',
            terminalId,
            data: data
          })}\n\n`)
        )
      })

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        safeEnqueue(
          encoder.encode(`data: ${JSON.stringify({
            type: 'exit',
            terminalId,
            exitCode,
            signal
          })}\n\n`)
        )
        cleanup()
      })

      // Keep connection alive
      keepAliveInterval = setInterval(() => {
        safeEnqueue(encoder.encode(':\n\n'))
      }, 15000)

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        console.log(`[PTY GET] ⚠️ Request aborted for ${terminalId}`)
        cleanup()
      })

      console.log(`[PTY GET] Stream setup complete for ${terminalId}`)
    }
  })

  console.log(`[PTY GET] Returning SSE stream for ${terminalId}`)
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

// POST endpoint for sending input to PTY
export async function POST(request: NextRequest) {
  try {
    const { terminalId = 'default', data, resize } = await request.json()

    console.log('[PTY POST] Request:', { terminalId, hasData: !!data, hasResize: !!resize })
    console.log('[PTY POST] Active sessions:', Array.from(sessions.keys()))

    const ptyProcess = sessions.get(terminalId)

    if (!ptyProcess) {
      console.error(`[PTY POST] Session not found: ${terminalId}`)
      return new Response(JSON.stringify({
        success: false,
        error: `Terminal session not found: ${terminalId}. Active sessions: ${Array.from(sessions.keys()).join(', ')}`
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Handle resize request
    if (resize) {
      const { cols, rows } = resize
      ptyProcess.resize(cols, rows)
      return new Response(JSON.stringify({
        success: true,
        message: 'Terminal resized'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Handle data input
    if (data !== undefined) {
      ptyProcess.write(data)
      return new Response(JSON.stringify({
        success: true,
        message: 'Data sent to terminal'
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'No data or resize command provided'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('PTY API error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// DELETE endpoint to close a terminal session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const terminalId = searchParams.get('terminalId') || 'default'

    const ptyProcess = sessions.get(terminalId)

    if (ptyProcess) {
      ptyProcess.kill()
      sessions.delete(terminalId)
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Terminal session closed'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('PTY DELETE error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
