import { NextRequest } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

// Store active file watchers
const watchers = new Map<string, { watcher: fs.FSWatcher, clients: Set<ReadableStreamDefaultController> }>()

// GET endpoint for SSE connection to watch file changes
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('filePath')

  if (!filePath) {
    return new Response(JSON.stringify({ error: 'filePath is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  console.log('[File Watch] Starting watch for:', filePath)

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return new Response(JSON.stringify({ error: 'File not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Get file stats for initial data
  const initialStats = fs.statSync(filePath)
  let lastModifiedTime = initialStats.mtimeMs

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
            console.error('[File Watch] Error enqueueing data:', error)
            isClosed = true
          }
        }
      }

      const cleanup = () => {
        console.log(`[File Watch] Cleanup called for ${filePath}, isClosed: ${isClosed}`)
        if (isClosed) return
        isClosed = true

        if (keepAliveInterval) {
          clearInterval(keepAliveInterval)
          keepAliveInterval = null
        }

        // Remove this client from the watcher
        const watcherData = watchers.get(filePath)
        if (watcherData) {
          watcherData.clients.delete(controller)

          // If no more clients, close the watcher
          if (watcherData.clients.size === 0) {
            console.log(`[File Watch] No more clients for ${filePath}, closing watcher`)
            watcherData.watcher.close()
            watchers.delete(filePath)
          }
        }

        try {
          controller.close()
        } catch (error) {
          // Controller already closed, ignore
        }
      }

      // Send initial connection message
      console.log(`[File Watch] Sending 'connected' message for ${filePath}`)
      safeEnqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          filePath,
          message: 'File watch established'
        })}\n\n`)
      )

      // Get or create watcher for this file
      let watcherData = watchers.get(filePath)

      if (!watcherData) {
        console.log(`[File Watch] Creating new watcher for ${filePath}`)

        const watcher = fs.watch(filePath, (eventType, filename) => {
          console.log(`[File Watch] File event: ${eventType} for ${filePath}`)

          // Get the current watcher data from the map (not from closure)
          const currentWatcherData = watchers.get(filePath)
          if (!currentWatcherData) {
            console.log(`[File Watch] Watcher data not found for ${filePath}`)
            return
          }

          // Check if file still exists (could be deleted)
          if (!fs.existsSync(filePath)) {
            console.log(`[File Watch] File deleted: ${filePath}`)
            currentWatcherData.clients.forEach(client => {
              try {
                client.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'deleted',
                    filePath
                  })}\n\n`)
                )
              } catch (error) {
                console.error('[File Watch] Error notifying client:', error)
              }
            })
            return
          }

          // Get current stats
          try {
            const stats = fs.statSync(filePath)
            const currentModifiedTime = stats.mtimeMs

            // Only notify if file was actually modified (avoid duplicate events)
            if (currentModifiedTime > lastModifiedTime) {
              lastModifiedTime = currentModifiedTime

              console.log(`[File Watch] File modified: ${filePath}, reading new content`)

              // Read new content
              const newContent = fs.readFileSync(filePath, 'utf-8')

              // Notify all clients watching this file
              console.log(`[File Watch] Notifying ${currentWatcherData.clients.size} client(s)`)
              currentWatcherData.clients.forEach(client => {
                try {
                  client.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      type: 'changed',
                      filePath,
                      content: newContent,
                      timestamp: currentModifiedTime
                    })}\n\n`)
                  )
                  console.log(`[File Watch] Client notified successfully`)
                } catch (error) {
                  console.error('[File Watch] Error notifying client:', error)
                }
              })
            } else {
              console.log(`[File Watch] File not modified (same timestamp), skipping notification`)
            }
          } catch (error) {
            console.error('[File Watch] Error reading file:', error)
          }
        })

        watcherData = {
          watcher,
          clients: new Set([controller])
        }
        watchers.set(filePath, watcherData)
      } else {
        console.log(`[File Watch] Reusing existing watcher for ${filePath}`)
        watcherData.clients.add(controller)
      }

      // Keep connection alive
      keepAliveInterval = setInterval(() => {
        safeEnqueue(encoder.encode(':\n\n'))
      }, 15000)

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        console.log(`[File Watch] Request aborted for ${filePath}`)
        cleanup()
      })

      console.log(`[File Watch] Stream setup complete for ${filePath}`)
    }
  })

  console.log(`[File Watch] Returning SSE stream for ${filePath}`)
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

// DELETE endpoint to stop watching a file
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('filePath')

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'filePath is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const watcherData = watchers.get(filePath)

    if (watcherData) {
      watcherData.watcher.close()
      watchers.delete(filePath)
      console.log(`[File Watch] Stopped watching: ${filePath}`)
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'File watch stopped'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[File Watch] DELETE error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
