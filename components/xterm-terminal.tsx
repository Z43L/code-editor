"use client"

import React, { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  workingDirectory: string
  terminalId: string
  isActive: boolean
}

export const XtermTerminal: React.FC<XtermTerminalProps> = ({ workingDirectory, terminalId, isActive }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const terminalInstanceRef = useRef<any>(null)
  const hasInitialized = useRef<boolean>(false)
  const fitAddonRef = useRef<any>(null)
  const initialWorkingDirectory = useRef<string>(workingDirectory)
  const retryAttemptRef = useRef<number>(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isCleanedUpRef = useRef<boolean>(false)
  const retryMessageShownRef = useRef<boolean>(false)

  const safeTerminalId = (terminalId && terminalId !== 'undefined' && terminalId !== 'null') ? terminalId : 'default'

  // Use refs to avoid circular dependencies between connectSSE <-> scheduleReconnect
  // and to satisfy the exhaustive-deps lint rule.
  const connectSSERef = useRef<(terminal: any) => void>(() => {})
  const scheduleReconnectRef = useRef<(terminal: any) => void>(() => {})

  // SSE connect/reconnect with exponential backoff
  connectSSERef.current = (terminal: any) => {
    if (isCleanedUpRef.current) return

    const sseUrl = `/api/terminal/pty?terminalId=${encodeURIComponent(safeTerminalId)}&cwd=${encodeURIComponent(initialWorkingDirectory.current)}`
    console.log(`[XtermTerminal ${safeTerminalId}] Opening SSE: ${sseUrl}`)

    const eventSource = new EventSource(sseUrl)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log(`[XtermTerminal ${safeTerminalId}] PTY connection established`)
      // Reset backoff on successful connection
      if (retryAttemptRef.current > 0) {
        terminal.write('\r\n\x1b[32m✔ Conexión restablecida\x1b[0m\r\n')
        terminal.scrollToBottom()
      }
      retryAttemptRef.current = 0
      retryMessageShownRef.current = false
    }

    eventSource.onmessage = (event) => {
      // Ignore empty or comment-only messages (keep-alive)
      if (!event.data || event.data.trim() === '' || event.data.startsWith(':')) {
        return
      }

      try {
        const message = JSON.parse(event.data)

        switch (message.type) {
          case 'connected':
            console.log('Terminal connected:', message)
            break

          case 'output':
            // Write all output directly to terminal
            if (message.data) {
              console.log('Writing to terminal:', message.data.slice(0, 50))
              terminal.write(message.data)

              // Force refresh to ensure rendering
              requestAnimationFrame(() => {
                terminal.scrollToBottom()
                terminal.refresh(0, terminal.rows - 1)
              })
            }
            break

          case 'exit':
            console.log('Terminal exited:', message)
            terminal.write('\r\n\x1b[31mTerminal session ended\x1b[0m\r\n')
            terminal.scrollToBottom()
            break
        }
      } catch (error) {
        // Silently ignore parse errors for keep-alive messages
        if (event.data && event.data !== ':') {
          console.error('Failed to parse SSE message:', error, event.data)
        }
      }
    }

    eventSource.onerror = (error) => {
      console.error(`[XtermTerminal ${safeTerminalId}] SSE error:`, error)
      // EventSource will try to reconnect on its own, but if it gives up
      // we want to ensure we keep trying with backoff.
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      scheduleReconnectRef.current(terminal)
    }
  }

  scheduleReconnectRef.current = (terminal: any) => {
    if (isCleanedUpRef.current) return

    const attempt = retryAttemptRef.current
    // Exponential backoff: 1s, 2s, 4s, 8s, ... cap 30s
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000)
    retryAttemptRef.current = attempt + 1

    // Show a single "reconnecting" message after the first failure (not on every retry)
    if (!retryMessageShownRef.current) {
      terminal.write('\r\n\x1b[33m⚠ Conexión perdida. Reintentando...\x1b[0m\r\n')
      terminal.scrollToBottom()
      retryMessageShownRef.current = true
    }

    console.log(`[XtermTerminal ${safeTerminalId}] Reconnecting in ${delay}ms (attempt ${retryAttemptRef.current})`)

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      if (isCleanedUpRef.current) return
      connectSSERef.current(terminal)
    }, delay)
  }

  useEffect(() => {
    console.log(`[XtermTerminal ${safeTerminalId}] Component mounted or terminalId changed`)
    let terminal: any
    let fitAddon: any
    let isCleanedUp = false

    const initTerminal = async () => {
      if (!terminalRef.current || isCleanedUp) return

      // Prevent double initialization
      if (hasInitialized.current) {
        console.log(`[XtermTerminal ${safeTerminalId}] Terminal already initialized, skipping...`)
        return
      }
      hasInitialized.current = true

      console.log(`[XtermTerminal ${safeTerminalId}] Initializing terminal...`)

      // Dynamic import for xterm.js components
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')
      const { CanvasAddon } = await import('@xterm/addon-canvas')

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 10,
        fontFamily: 'Monaco, "DejaVu Sans Mono", "Ubuntu Mono", monospace',
        letterSpacing: 0,
        lineHeight: 1.2,
        scrollback: 10000,
        convertEol: true,
        allowTransparency: false,
        cursorStyle: 'block',
        theme: {
          background: '#1e1e1e',
          foreground: '#ffffff',
          cursor: '#ffffff',
          cursorAccent: '#1e1e1e',
          selection: 'rgba(255, 255, 255, 0.3)',
          black: '#000000',
          red: '#cd3131',
          green: '#0dbc79',
          yellow: '#e5e510',
          blue: '#2472c8',
          magenta: '#bc3fbc',
          cyan: '#11a8cd',
          white: '#e5e5e5',
          brightBlack: '#666666',
          brightRed: '#f14c4c',
          brightGreen: '#23d18b',
          brightYellow: '#f5f543',
          brightBlue: '#3b8eea',
          brightMagenta: '#d670d6',
          brightCyan: '#29b8db',
          brightWhite: '#ffffff'
        }
      })

      console.log('Terminal created with config:', {
        fontSize: 14,
        theme: 'dark'
      })

      fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()
      const canvasAddon = new CanvasAddon()

      // Load canvas addon FIRST to force canvas rendering
      console.log('Loading CanvasAddon...')
      terminal.loadAddon(canvasAddon)

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(webLinksAddon)

      console.log('All addons loaded')

      // Store terminal instance
      terminalInstanceRef.current = terminal

      // Clear the container before opening to prevent duplicates
      if (terminalRef.current) {
        console.log('Clearing terminal container...')
        terminalRef.current.innerHTML = ''
      }

      if (!terminalRef.current) {
        console.error('Terminal ref is null, cannot open terminal')
        return
      }

      console.log('Opening terminal in container:', terminalRef.current)
      terminal.open(terminalRef.current)
      console.log('Terminal opened in DOM')

      // Wait a bit for the canvas to be created
      await new Promise(resolve => setTimeout(resolve, 50))

      // Check for canvas immediately after opening
      let canvas = terminalRef.current?.querySelector('canvas')
      console.log('Canvas immediately after open:', canvas)

      // Wait for canvas to be created
      let attempts = 0
      while (!canvas && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 50))
        canvas = terminalRef.current?.querySelector('canvas')
        attempts++
        console.log(`Canvas check attempt ${attempts}:`, canvas)
      }

      if (!canvas) {
        console.error('CRITICAL: Canvas was never created!')
        console.log('Terminal container children:', terminalRef.current?.children)
        console.log('Terminal container HTML:', terminalRef.current?.innerHTML)
      } else {
        console.log('✅ Canvas found!', canvas)
      }

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        fitAddon.fit()

        console.log('Terminal dimensions after fit:', {
          cols: terminal.cols,
          rows: terminal.rows,
          containerWidth: terminalRef.current?.offsetWidth,
          containerHeight: terminalRef.current?.offsetHeight
        })

        // Check if canvas exists
        const finalCanvas = terminalRef.current?.querySelector('canvas')
        console.log('Final canvas element:', finalCanvas)
        console.log('Final canvas dimensions:', finalCanvas?.width, 'x', finalCanvas?.height)

        if (finalCanvas) {
          const ctx = (finalCanvas as HTMLCanvasElement).getContext('2d')
          console.log('Canvas context:', ctx)
        }

        // Scroll to bottom to show the active prompt
        terminal.scrollToBottom()

        terminal.focus()

        // Force a refresh to make sure canvas is rendered
        terminal.refresh(0, terminal.rows - 1)

        // Write a test message to verify terminal is working
        console.log('Terminal buffer lines:', terminal.buffer.active.length)
      }, 200)

      // Connect to PTY via Server-Sent Events
      fitAddonRef.current = fitAddon
      connectSSERef.current(terminal)

      // Handle terminal input - send to PTY
      terminal.onData(async (data: string) => {
        try {
          await fetch('/api/terminal/pty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              terminalId: safeTerminalId,
              data: data
            })
          })
          // Scroll to bottom after input
          terminal.scrollToBottom()
        } catch (error) {
          console.error('Failed to send data to PTY:', error)
        }
      })

      // Handle resize with debouncing
      let resizeTimeout: NodeJS.Timeout | null = null
      const resizeObserver = new ResizeObserver(() => {
        if (fitAddon && terminal) {
          // Clear previous timeout
          if (resizeTimeout) {
            clearTimeout(resizeTimeout)
          }

          // Debounce resize
          resizeTimeout = setTimeout(() => {
            fitAddon.fit()
            terminal.refresh(0, terminal.rows - 1)

            console.log('Terminal resized:', {
              cols: terminal.cols,
              rows: terminal.rows,
              containerWidth: terminalRef.current?.offsetWidth
            })

            // Notify PTY of resize
            fetch('/api/terminal/pty', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                terminalId: safeTerminalId,
                resize: {
                  cols: terminal.cols,
                  rows: terminal.rows
                }
              })
            }).catch(console.error)
          }, 100)
        }
      })

      if (terminalRef.current) {
        resizeObserver.observe(terminalRef.current)
      }

      // Cleanup (but DON'T delete the PTY session)
      return () => {
        console.log('Cleaning up terminal UI...')
        isCleanedUp = true
        hasInitialized.current = false
        resizeObserver.disconnect()
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
        if (terminal) {
          terminal.dispose()
        }
        terminalInstanceRef.current = null
        fitAddonRef.current = null
        // DON'T delete the PTY session - it should persist
      }
    }

    initTerminal()

    return () => {
      console.log(`[XtermTerminal ${safeTerminalId}] ⚠️ CLEANUP TRIGGERED - Component unmounting!`)
      console.trace(`[XtermTerminal ${safeTerminalId}] Cleanup stack trace`)
      isCleanedUp = true
      isCleanedUpRef.current = true
      hasInitialized.current = false
      retryAttemptRef.current = 0
      retryMessageShownRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      if (eventSourceRef.current) {
        console.log(`[XtermTerminal ${safeTerminalId}] Closing EventSource`)
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (terminalInstanceRef.current) {
        console.log(`[XtermTerminal ${safeTerminalId}] Disposing terminal instance`)
        terminalInstanceRef.current.dispose()
        terminalInstanceRef.current = null
      }
      fitAddonRef.current = null
    }
  }, [safeTerminalId])

  // Handle visibility changes when switching between terminals
  useEffect(() => {
    if (isActive && terminalInstanceRef.current && fitAddonRef.current) {
      // When terminal becomes active, fit and focus it
      setTimeout(() => {
        if (fitAddonRef.current && terminalInstanceRef.current) {
          fitAddonRef.current.fit()
          terminalInstanceRef.current.focus()
          terminalInstanceRef.current.scrollToBottom()
        }
      }, 50)
    }
  }, [isActive])

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: '#1e1e1e' }}>
      <div
        ref={terminalRef}
        className="w-full h-full terminal-container"
        style={{
          padding: '8px',
          backgroundColor: '#1e1e1e',
          overflow: 'hidden',
          cursor: 'text',
          position: 'relative',
          zIndex: 1,
          boxSizing: 'border-box'
        }}
        onMouseDown={(e) => {
          // Ensure terminal gets focus on any mouse interaction
          e.preventDefault()
          const textarea = terminalRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement
          if (textarea) {
            textarea.focus()
          }
        }}
        tabIndex={0}
      />
    </div>
  )
}
