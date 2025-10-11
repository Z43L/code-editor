import { NextRequest } from 'next/server'
import { spawn } from 'child_process'

interface TerminalSession {
  terminalId: string
  cwd: string
  process: ReturnType<typeof spawn> | null
}

class TerminalWebSocketServer {
  private sessions: Map<string, TerminalSession> = new Map()
  private clients: Map<string, WebSocket> = new Map()

  handleConnection(request: NextRequest, ws: WebSocket, terminalId: string, cwd: string) {
    const sessionId = `${terminalId}-${Date.now()}`

    // Store the WebSocket client
    this.clients.set(sessionId, ws)

    // Create terminal session
    this.sessions.set(sessionId, {
      terminalId,
      cwd,
      process: null
    })

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string)
        this.handleMessage(sessionId, message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
        ws.send(JSON.stringify({
          type: 'error',
          data: 'Invalid message format'
        }))
      }
    }

    ws.onclose = () => {
      const session = this.sessions.get(sessionId)
      if (session?.process) {
        session.process.kill()
      }
      this.sessions.delete(sessionId)
      this.clients.delete(sessionId)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      terminalId,
      cwd
    }))
  }

  private async handleMessage(sessionId: string, message: any) {
    const ws = this.clients.get(sessionId)
    const session = this.sessions.get(sessionId)

    if (!ws || !session) return

    switch (message.type) {
      case 'execute':
        await this.executeCommand(sessionId, message.command)
        break
      case 'input':
        this.sendInput(sessionId, message.data)
        break
      case 'close':
        this.closeSession(sessionId)
        break
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  private async executeCommand(sessionId: string, command: string) {
    const ws = this.clients.get(sessionId)
    const session = this.sessions.get(sessionId)

    if (!ws || !session) return

    try {
      const [cmd, ...args] = command.trim().split(' ')

      // Kill any existing process
      if (session.process) {
        session.process.kill()
      }

      const childProcess = spawn(cmd, args, {
        cwd: session.cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      session.process = childProcess

      childProcess.stdout?.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'output',
          data: data.toString(),
          terminalId: session.terminalId
        }))
      })

      childProcess.stderr?.on('data', (data) => {
        ws.send(JSON.stringify({
          type: 'output',
          data: data.toString(),
          terminalId: session.terminalId
        }))
      })

      childProcess.on('close', (code) => {
        ws.send(JSON.stringify({
          type: 'finished',
          exitCode: code,
          terminalId: session.terminalId
        }))
        session.process = null
      })

      childProcess.on('error', (error) => {
        ws.send(JSON.stringify({
          type: 'error',
          data: error.message,
          terminalId: session.terminalId
        }))
      })

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        data: `Failed to execute command: ${error}`,
        terminalId: session.terminalId
      }))
    }
  }

  private sendInput(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId)
    if (session?.process?.stdin?.writable) {
      session.process.stdin.write(data + '\n')
    }
  }

  private closeSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    const ws = this.clients.get(sessionId)

    if (session?.process) {
      session.process.kill()
    }

    if (ws) {
      ws.close()
    }

    this.sessions.delete(sessionId)
    this.clients.delete(sessionId)
  }
}

// Singleton instance
export const terminalWebSocketServer = new TerminalWebSocketServer()