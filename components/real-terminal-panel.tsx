"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Terminal } from 'lucide-react'
import { XtermTerminal } from './xterm-terminal'

interface TerminalPanelProps {
  isExpanded: boolean
  onToggle: () => void
  workingDirectory: string
}

interface TerminalInstance {
  id: string
  name: string
  cwd: string
  isActive: boolean
}

export const RealTerminalPanel: React.FC<TerminalPanelProps> = ({
  isExpanded,
  onToggle,
  workingDirectory
}) => {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [currentCommand, setCurrentCommand] = useState<string>('')
  const commandBuffer = useRef<string>('')

  // Create initial terminal if none exists
  useEffect(() => {
    if (terminals.length === 0 && workingDirectory) {
      const initialTerminal: TerminalInstance = {
        id: 'terminal-1',
        name: 'Terminal 1',
        cwd: workingDirectory,
        isActive: true
      }
      setTerminals([initialTerminal])
      setActiveTerminalId('terminal-1')
    }
  }, [workingDirectory, terminals.length])

  const createNewTerminal = useCallback(() => {
    const newTerminal: TerminalInstance = {
      id: `terminal-${terminals.length + 1}`,
      name: `Terminal ${terminals.length + 1}`,
      cwd: workingDirectory || process.cwd(),
      isActive: true
    }

    setTerminals(prev => prev.map(term => ({ ...term, isActive: false })).concat(newTerminal))
    setActiveTerminalId(newTerminal.id)
  }, [terminals.length, workingDirectory])

  const closeTerminal = useCallback((terminalId: string) => {
    setTerminals(prev => {
      const filtered = prev.filter(term => term.id !== terminalId)
      // If we close the active terminal, activate the last remaining one
      if (activeTerminalId === terminalId && filtered.length > 0) {
        filtered[filtered.length - 1].isActive = true
        setActiveTerminalId(filtered[filtered.length - 1].id)
      }
      return filtered
    })
  }, [activeTerminalId])

  const switchTerminal = useCallback((terminalId: string) => {
    setTerminals(prev => prev.map(term => ({
      ...term,
      isActive: term.id === terminalId
    })))
    setActiveTerminalId(terminalId)
  }, [])

  const handleTerminalData = useCallback(async (data: string) => {
    if (!activeTerminalId) return

    // Build command buffer
    commandBuffer.current += data

    // Handle Enter key
    if (data === '\r') {
      const command = commandBuffer.current.trim()
      commandBuffer.current = ''

      if (command && activeTerminalId) {
        try {
          const response = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: command,
              cwd: workingDirectory,
              terminalId: activeTerminalId
            })
          })

          const result = await response.json()

          // Here we would send the output back to xterm.js
          // For now, we'll just log it
          if (result.success) {
            console.log('Command executed:', result.output || result.error)
          }
        } catch (error) {
          console.error('Command execution error:', error)
        }
      }
    }
  }, [activeTerminalId, workingDirectory])

  const activeTerminal = terminals.find(term => term.isActive)

  return (
    <div className="terminal-panel h-full flex flex-col bg-[#1e1e1e] border-l border-[#3e3e3e]" data-testid="terminal-panel">
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-2 border-b border-[#3e3e3e]">
        <div className="flex items-center gap-2">
          <Terminal size={14} className="text-gray-400" />
          <span className="text-xs font-medium text-white">Terminal</span>
        </div>
        <button
          onClick={createNewTerminal}
          className="p-1 hover:bg-[#2a2d2e] rounded"
          title="Nueva terminal"
        >
          <Plus size={12} className="text-gray-400 hover:text-white" />
        </button>
      </div>

      {/* Terminal Tabs */}
      {terminals.length > 0 && (
        <div className="flex border-b border-[#3e3e3e] overflow-x-auto">
          {terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={`flex items-center gap-2 px-3 py-2 min-w-0 cursor-pointer border-r border-[#3e3e3e] ${
                terminal.isActive
                  ? "bg-[#2d2d30] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
              }`}
              onClick={() => switchTerminal(terminal.id)}
            >
              <Terminal size={12} />
              <span className="text-xs truncate">{terminal.name}</span>
              {terminals.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerminal(terminal.id)
                  }}
                  className="ml-1 p-0.5 hover:bg-[#3e3e3e] rounded"
                  title="Cerrar terminal"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Terminal Content */}
      <div className="flex-1 p-3 overflow-hidden">
        {activeTerminal ? (
          <div className="h-full bg-black rounded border border-[#3e3e3e] overflow-hidden">
            <XtermTerminal
              onData={handleTerminalData}
              workingDirectory={activeTerminal.cwd}
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Terminal size={48} className="mx-auto mb-4 opacity-50" />
              <p>No hay terminales abiertas</p>
              <button
                onClick={createNewTerminal}
                className="mt-4 px-4 py-2 bg-[#0e639c] hover:bg-[#1177bb] text-white text-sm rounded transition-colors"
              >
                Crear Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}