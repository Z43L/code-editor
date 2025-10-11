"use client"

import React, { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'

interface XtermTerminalProps {
  workingDirectory: string
}

export const XtermTerminal: React.FC<XtermTerminalProps> = ({ workingDirectory }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const terminalIdRef = useRef<string>(`terminal-${Date.now()}`)
  const terminalInstanceRef = useRef<any>(null)
  const hasInitialized = useRef<boolean>(false)

  useEffect(() => {
    let terminal: any
    let fitAddon: any
    let isCleanedUp = false

    const initTerminal = async () => {
      if (!terminalRef.current || isCleanedUp) return

      // Prevent double initialization
      if (hasInitialized.current) {
        console.log('Terminal already initialized, skipping...')
        return
      }
      hasInitialized.current = true

      console.log('Initializing terminal...')

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
      const terminalId = terminalIdRef.current
      const eventSource = new EventSource(
        `/api/terminal/pty?terminalId=${terminalId}&cwd=${encodeURIComponent(workingDirectory)}`
      )
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('PTY connection established')
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
        console.error('SSE error:', error)
        terminal.write('\r\n\x1b[31mConnection error. Retrying...\x1b[0m\r\n')
      }

      // Handle terminal input - send to PTY
      terminal.onData(async (data: string) => {
        try {
          await fetch('/api/terminal/pty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              terminalId: terminalId,
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
                terminalId: terminalId,
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

      // Cleanup
      return () => {
        console.log('Cleaning up terminal...')
        isCleanedUp = true
        hasInitialized.current = false
        resizeObserver.disconnect()
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        if (terminal) {
          terminal.dispose()
        }
        terminalInstanceRef.current = null
        // Close terminal session on backend
        fetch(`/api/terminal/pty?terminalId=${terminalId}`, {
          method: 'DELETE'
        }).catch(console.error)
      }
    }

    initTerminal()

    return () => {
      console.log('Effect cleanup triggered')
      isCleanedUp = true
      hasInitialized.current = false
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
        terminalInstanceRef.current = null
      }
    }
  }, [workingDirectory])

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
