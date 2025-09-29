"use client"

import React, { useState } from 'react'
import { useTypeScript, TsCompletionEntry } from '../hooks/use-typescript'

interface TypeScriptDemoProps {
  fileName: string
  code: string
}

export function TypeScriptDemo({ fileName, code }: TypeScriptDemoProps) {
  const { getSuggestions } = useTypeScript()
  const [suggestions, setSuggestions] = useState<TsCompletionEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [cursorPosition, setCursorPosition] = useState(0)

  const handleGetSuggestions = async () => {
    setLoading(true)
    try {
      const result = await getSuggestions(fileName, code, cursorPosition)
      setSuggestions(result)
    } catch (error) {
      console.error('Error getting suggestions:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">TypeScript IntelliSense Demo</h3>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Cursor Position:
          <input
            type="number"
            value={cursorPosition}
            onChange={(e) => setCursorPosition(Number(e.target.value))}
            className="ml-2 px-2 py-1 border rounded"
            min="0"
          />
        </label>
      </div>

      <button
        onClick={handleGetSuggestions}
        disabled={loading}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Cargando...' : 'Obtener Sugerencias'}
      </button>

      {suggestions.length > 0 && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Sugerencias encontradas ({suggestions.length}):</h4>
          <div className="max-h-60 overflow-y-auto">
            {suggestions.slice(0, 20).map((suggestion, index) => (
              <div key={index} className="p-2 border-b border-gray-200 dark:border-gray-600">
                <div className="font-mono text-sm">
                  <span className="font-semibold text-blue-600">{suggestion.name}</span>
                  <span className="ml-2 text-xs text-gray-500">({suggestion.kind})</span>
                </div>
                {suggestion.insertText && suggestion.insertText !== suggestion.name && (
                  <div className="text-xs text-gray-600 mt-1">
                    Insert: {suggestion.insertText}
                  </div>
                )}
              </div>
            ))}
            {suggestions.length > 20 && (
              <div className="p-2 text-center text-sm text-gray-500">
                ... y {suggestions.length - 20} más
              </div>
            )}
          </div>
        </div>
      )}

      {suggestions.length === 0 && !loading && (
        <div className="mt-4 text-gray-500">
          No se encontraron sugerencias. Intenta cambiar la posición del cursor.
        </div>
      )}
    </div>
  )
}