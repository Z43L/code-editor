'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Bot, Loader2, X } from 'lucide-react'

interface AIHoverTooltipProps {
  explanation: string | null
  isVisible: boolean
  isLoading: boolean
  position: { top: number; left: number }
  onClose: () => void
  error?: string | null
}

export function AIHoverTooltip({
  explanation,
  isVisible,
  isLoading,
  position,
  onClose,
  error,
}: AIHoverTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Cerrar cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  // Cerrar después de un tiempo si no hay movimiento del mouse
  useEffect(() => {
    if (!isVisible || isLoading) return

    const timeout = setTimeout(() => {
      onClose()
    }, 8000) // 8 segundos para explicaciones de IA

    return () => clearTimeout(timeout)
  }, [isVisible, isLoading, onClose])

  if (!isVisible) {
    return null
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[100] bg-blue-900 dark:bg-blue-950 border border-blue-600 rounded-lg shadow-xl p-4 max-w-md pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-blue-300">Explicación IA</span>
        </div>
        <button
          onClick={onClose}
          className="text-blue-400 hover:text-blue-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="text-sm text-white">
        {isLoading && (
          <div className="flex items-center gap-2 text-blue-300">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generando explicación...</span>
          </div>
        )}

        {error && (
          <div className="text-red-400 bg-red-900/20 rounded p-2">
            <strong>Error:</strong> {error}
          </div>
        )}

        {explanation && !isLoading && (
          <div className="prose prose-sm prose-invert max-w-none">
            <div dangerouslySetInnerHTML={{ __html: markdownToHtml(explanation) }} />
          </div>
        )}
      </div>
    </div>
  )
}

// Función simple para convertir markdown básico a HTML
function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-gray-800 px-1 rounded text-xs">$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>')
}