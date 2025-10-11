import { NextRequest } from 'next/server'

let clients: Set<ResponseWriter> = new Set()

interface ResponseWriter {
  terminalId: string
  writer: WritableStreamDefaultWriter<Uint8Array>
  encoder: TextEncoder
}

export async function POST(request: NextRequest) {
  const { command, cwd, terminalId } = await request.json()

  if (!command || !terminalId) {
    return new Response('Missing command or terminalId', { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()

      // Enviar evento de inicio
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start', terminalId })}\n\n`))

      const { spawn } = require('child_process')
      const [cmd, ...args] = command.split(' ')

      const childProcess = spawn(cmd, args, {
        cwd: cwd || process.cwd(),
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let outputBuffer = ''

      const sendOutput = (data: string, type: 'output' | 'error') => {
        const lines = data.split('\n')
        for (const line of lines) {
          if (line.trim()) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type,
              data: line + '\n',
              terminalId
            })}\n\n`))
          }
        }
      }

      childProcess.stdout?.on('data', (data: Buffer) => {
        sendOutput(data.toString(), 'output')
      })

      childProcess.stderr?.on('data', (data: Buffer) => {
        sendOutput(data.toString(), 'error')
      })

      childProcess.on('close', (code: number) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'end',
          exitCode: code,
          terminalId
        })}\n\n`))
        controller.close()
      })

      childProcess.on('error', (error: Error) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          data: error.message,
          terminalId
        })}\n\n`))
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}