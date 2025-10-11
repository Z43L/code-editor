"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Plus, X, Terminal } from "lucide-react"

interface TerminalPanelProps {
  isExpanded: boolean
  onToggle: () => void
  workingDirectory: string
}

interface TerminalInstance {
  id: string
  name: string
  cwd: string
  output: string[]
  commandHistory: string[]
  historyIndex: number
  isActive: boolean
  isExecuting: boolean
}

export const SimpleTerminalPanel: React.FC<TerminalPanelProps> = ({
  isExpanded,
  onToggle,
  workingDirectory
}) => {
  const [terminals, setTerminals] = useState<TerminalInstance[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null)
  const [currentCommand, setCurrentCommand] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Create initial terminal if none exists
  useEffect(() => {
    if (terminals.length === 0 && workingDirectory) {
      const initialTerminal: TerminalInstance = {
        id: 'terminal-1',
        name: 'Terminal 1',
        cwd: workingDirectory,
        output: [`$ cd ${workingDirectory}`, ''],
        commandHistory: [],
        historyIndex: -1,
        isActive: true,
        isExecuting: false
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
      output: [`$ cd ${workingDirectory || process.cwd()}`, ''],
      commandHistory: [],
      historyIndex: -1,
      isActive: true,
      isExecuting: false
    }

    setTerminals(prev => prev.map(term => ({ ...term, isActive: false })).concat(newTerminal))
    setActiveTerminalId(newTerminal.id)
    setCurrentCommand("")

    // Focus input when creating a new terminal
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
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
    setCurrentCommand("")
    // Focus input when switching terminals
    setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
  }, [])

  const executeCommand = useCallback(async (command: string, terminalId: string) => {
    if (!command.trim()) return

    const trimmedCommand = command.trim()

    // Special command: clear
    if (trimmedCommand === 'clear') {
      setTerminals(prev => prev.map(term => {
        if (term.id === terminalId) {
          return {
            ...term,
            output: [`$ cd ${term.cwd}`, ''],
            isExecuting: false
          }
        }
        return term
      }))
      setCurrentCommand("")
      setTimeout(() => inputRef.current?.focus(), 0)
      return
    }

    // Update terminal output and command history
    setTerminals(prev => prev.map(term => {
      if (term.id === terminalId) {
        const newOutput = [...term.output, `$ ${trimmedCommand}`]
        const newCommandHistory = [...term.commandHistory, trimmedCommand]
        return {
          ...term,
          output: newOutput,
          commandHistory: newCommandHistory,
          historyIndex: newCommandHistory.length,
          isExecuting: true
        }
      }
      return term
    }))

    try {
      const response = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmedCommand,
          cwd: workingDirectory,
          terminalId
        })
      })

      const result = await response.json()

      setTerminals(prev => prev.map(term => {
        if (term.id === terminalId) {
          const newOutput = [...term.output]
          if (result.output) newOutput.push(result.output)
          if (result.error) newOutput.push(result.error)
          newOutput.push('')
          return {
            ...term,
            output: newOutput,
            isExecuting: false
          }
        }
        return term
      }))
    } catch (error) {
      console.error('Command execution error:', error)
      setTerminals(prev => prev.map(term => {
        if (term.id === terminalId) {
          const newOutput = [...term.output, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, '']
          return {
            ...term,
            output: newOutput,
            isExecuting: false
          }
        }
        return term
      }))
    }

    setCurrentCommand("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [workingDirectory])

  const handleCommandSubmit = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && activeTerminalId && currentCommand.trim()) {
      executeCommand(currentCommand, activeTerminalId)
    }
  }, [currentCommand, activeTerminalId, executeCommand])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activeTerminalId) return

    const activeTerminal = terminals.find(t => t.id === activeTerminalId)
    if (!activeTerminal) return

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (activeTerminal.commandHistory.length > 0) {
        const newIndex = Math.max(0, activeTerminal.historyIndex - 1)
        setTerminals(prev => prev.map(term =>
          term.id === activeTerminalId
            ? { ...term, historyIndex: newIndex }
            : term
        ))
        setCurrentCommand(activeTerminal.commandHistory[newIndex] || "")
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (activeTerminal.commandHistory.length > 0) {
        const newIndex = Math.min(activeTerminal.commandHistory.length, activeTerminal.historyIndex + 1)
        const command = newIndex < activeTerminal.commandHistory.length ? activeTerminal.commandHistory[newIndex] : ""
        setTerminals(prev => prev.map(term =>
          term.id === activeTerminalId
            ? { ...term, historyIndex: newIndex }
            : term
        ))
        setCurrentCommand(command)
      }
    }
  }, [activeTerminalId, terminals])

  // Auto-focus on input when panel expands
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isExpanded])

  // Auto-scroll to bottom when active terminal output updates
  useEffect(() => {
    const activeTerminal = terminals.find(term => term.isActive)
    if (activeTerminal && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [terminals.find(term => term.isActive)?.output])

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
          <div className="h-full bg-black rounded border border-[#3e3e3e] overflow-hidden flex flex-col">
            <div className="p-2 text-green-400 text-sm font-mono flex flex-col h-full">
              <div className="text-gray-400 mb-2 flex-shrink-0">
                Directorio: {activeTerminal.cwd}
              </div>
              <div
                ref={outputRef}
                className="flex-1 overflow-y-auto space-y-1">
                {activeTerminal.output.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {line}
                  </div>
                ))}
              </div>
              <div className="flex items-center mt-2 flex-shrink-0">
                <span className="text-green-400">$ </span>
                <input
                  ref={inputRef}
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-green-400 ml-2"
                  placeholder="Escribe un comando..."
                  value={currentCommand}
                  onChange={(e) => setCurrentCommand(e.target.value)}
                  onKeyDown={(e) => {
                    handleCommandSubmit(e)
                    handleKeyDown(e)
                  }}
                  disabled={activeTerminal?.isExecuting}
                  autoFocus
                />
                {activeTerminal?.isExecuting && (
                  <div className="ml-2 w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>
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