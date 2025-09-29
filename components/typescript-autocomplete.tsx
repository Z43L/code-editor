'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Check, ChevronRight, CornerDownLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CompletionItem } from '../hooks/use-language-service'

interface TypeScriptAutocompleteProps {
  suggestions: CompletionItem[]
  isVisible: boolean
  position: { top: number; left: number }
  onSelect: (suggestion: CompletionItem) => void
  onClose: () => void
  selectedIndex: number
  onSelectIndex: (index: number) => void
}

export function TypeScriptAutocomplete({
  suggestions,
  isVisible,
  position,
  onSelect,
  onClose,
  selectedIndex,
  onSelectIndex,
}: TypeScriptAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipContent, setTooltipContent] = useState<string>('')
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Filtrar sugerencias que no tengan label válido
  const validSuggestions = suggestions?.filter(s => {
    const displayText = s.label || s.name;
    const hasValidText = s && displayText && String(displayText).trim() !== '';
    return hasValidText;
  }) || [];

  // Cerrar cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
        setShowTooltip(false)
        setHoveredIndex(null)
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  // Función para manejar hover con delay
  const handleMouseEnter = (index: number, event: React.MouseEvent) => {
    setHoveredIndex(index)

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }

    hoverTimeoutRef.current = setTimeout(() => {
      const suggestion = validSuggestions[index]
      if (suggestion && (suggestion.documentation || suggestion.detail)) {
        const rect = (event.target as HTMLElement).getBoundingClientRect()
        setTooltipContent(suggestion.documentation || suggestion.detail || '')
        setTooltipPosition({
          top: rect.top - 10,
          left: rect.right + 10
        })
        setShowTooltip(true)
      }
    }, 500) // 500ms delay
  }

  const handleMouseLeave = () => {
    setHoveredIndex(null)
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setShowTooltip(false)
  }

  // Manejar navegación con teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isVisible || validSuggestions.length === 0) return

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          onSelectIndex((selectedIndex + 1) % validSuggestions.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          onSelectIndex(selectedIndex === 0 ? validSuggestions.length - 1 : selectedIndex - 1)
          break

        // Removido: Tab y Escape ya no seleccionan
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, validSuggestions, selectedIndex, onSelect, onSelectIndex])

  if (!isVisible || validSuggestions.length === 0) {
    return null
  }

  const getKindIcon = (kind: string) => {
    switch (kind.toLowerCase()) {
      case 'class': return '🏗️'
      case 'interface': return '📋'
      case 'function': return '⚡'
      case 'method': return '🔧'
      case 'property': return '📄'
      case 'variable': return '📦'
      case 'const': return '🔒'
      case 'constant': return '🔒'
      case 'type': return '🏷️'
      case 'enum': return '📊'
      case 'enum member': return '🔹'
      case 'module': return '📦'
      case 'namespace': return '🏛️'
      case 'package': return '📦'
      case 'file': return '📄'
      case 'folder': return '📁'
      case 'keyword': return '🔑'
      case 'snippet': return '✂️'
      case 'color': return '🎨'
      case 'reference': return '🔗'
      case 'value': return '💎'
      case 'unit': return '📏'
      case 'text': return '📝'
      case 'operator': return '⚙️'
      case 'struct': return '🏗️'
      case 'event': return '📢'
      case 'field': return '🏷️'
      case 'constructor': return '🚧'
      case 'parameter': return '📥'
      case 'local': return '🏠'
      default: return '📝'
    }
  }

  const getKindColor = (kind: string) => {
    switch (kind.toLowerCase()) {
      case 'class': return 'text-blue-600 dark:text-blue-400'
      case 'interface': return 'text-green-600 dark:text-green-400'
      case 'function': return 'text-purple-600 dark:text-purple-400'
      case 'method': return 'text-orange-600 dark:text-orange-400'
      case 'property': return 'text-cyan-600 dark:text-cyan-400'
      case 'variable': return 'text-yellow-600 dark:text-yellow-400'
      case 'const':
      case 'constant': return 'text-red-600 dark:text-red-400'
      case 'type': return 'text-indigo-600 dark:text-indigo-400'
      case 'enum': return 'text-pink-600 dark:text-pink-400'
      case 'enum member': return 'text-pink-500 dark:text-pink-300'
      case 'module':
      case 'namespace':
      case 'package': return 'text-teal-600 dark:text-teal-400'
      case 'file': return 'text-gray-600 dark:text-gray-400'
      case 'folder': return 'text-amber-600 dark:text-amber-400'
      case 'keyword': return 'text-slate-600 dark:text-slate-400'
      case 'snippet': return 'text-emerald-600 dark:text-emerald-400'
      case 'color': return 'text-rose-600 dark:text-rose-400'
      case 'reference': return 'text-violet-600 dark:text-violet-400'
      case 'value': return 'text-lime-600 dark:text-lime-400'
      case 'unit': return 'text-sky-600 dark:text-sky-400'
      case 'text': return 'text-stone-600 dark:text-stone-400'
      case 'operator': return 'text-neutral-600 dark:text-neutral-400'
      case 'struct': return 'text-blue-700 dark:text-blue-300'
      case 'event': return 'text-orange-700 dark:text-orange-300'
      case 'field': return 'text-indigo-700 dark:text-indigo-300'
      case 'constructor': return 'text-amber-700 dark:text-amber-300'
      case 'parameter': return 'text-emerald-700 dark:text-emerald-300'
      case 'local': return 'text-slate-700 dark:text-slate-300'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-[100] bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border-2 border-blue-300 dark:border-blue-600 rounded-xl shadow-2xl max-h-80 overflow-hidden min-w-80 max-w-md animate-in fade-in-0 zoom-in-95 duration-200"
      style={{
        top: position.top,
        left: position.left,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(59, 130, 246, 0.1)',
      }}
    >
      <div className="border-b border-blue-200 dark:border-blue-700 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/50 dark:to-indigo-900/50 rounded-t-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            {validSuggestions.length} sugerencias disponibles
          </span>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-blue-300 dark:scrollbar-thumb-blue-600 scrollbar-track-transparent">
        {validSuggestions.map((suggestion, index) => (
          <div
            key={`${suggestion.label || suggestion.name}-${index}`}
            className={cn(
              'flex items-center px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 transition-all duration-150 group relative',
              index === selectedIndex
                ? 'bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/60 dark:to-blue-800/60 border-blue-300 dark:border-blue-600 shadow-inner'
                : index === hoveredIndex
                ? 'bg-gradient-to-r from-gray-100 to-blue-50/50 dark:from-gray-700/70 dark:to-blue-900/30 border-blue-200 dark:border-blue-700'
                : 'hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50/30 dark:hover:from-gray-700/50 dark:hover:to-blue-900/20'
            )}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={(e) => handleMouseEnter(index, e)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Indicador visual de selección con animación */}
            {index === selectedIndex && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 via-blue-600 to-blue-700 rounded-r-full animate-pulse"></div>
            )}

            <span className="text-lg mr-3 flex-shrink-0 transition-all duration-200 group-hover:scale-110 filter drop-shadow-sm">
              {getKindIcon(suggestion.kind)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center">
                <span className={cn(
                  "font-semibold text-sm truncate transition-all duration-150",
                  index === selectedIndex
                    ? "text-blue-900 dark:text-blue-100 scale-105"
                    : "text-gray-900 dark:text-gray-100 group-hover:text-blue-800 dark:group-hover:text-blue-200"
                )}>
                  {suggestion.label || suggestion.name}
                </span>
                {suggestion.insertText && suggestion.insertText !== (suggestion.label || suggestion.name) && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 truncate opacity-75">
                    → {suggestion.insertText}
                  </span>
                )}
              </div>
              <div className={cn('text-xs font-medium transition-colors duration-150 flex items-center gap-1', getKindColor(suggestion.kind))}>
                <span>{getKindIcon(suggestion.kind)}</span>
                <span>{suggestion.kind}</span>
                {suggestion.detail && (
                  <span className="text-gray-500 dark:text-gray-400 ml-1">• {suggestion.detail}</span>
                )}
              </div>
              {suggestion.documentation && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate max-w-xs opacity-80 leading-tight">
                  {suggestion.documentation}
                </div>
              )}
            </div>
            {index === selectedIndex && (
              <div className="ml-3 flex-shrink-0 flex items-center gap-1">
                <CornerDownLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">ESC</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-blue-200 dark:border-blue-700 px-4 py-3 text-xs text-blue-600 dark:text-blue-400 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-b-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs font-mono">↑↓</kbd>
              <span>Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-blue-200 dark:bg-blue-800 rounded text-xs font-mono font-semibold">ESC</kbd>
              <span className="font-medium text-blue-700 dark:text-blue-300">Seleccionar</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-600 dark:text-blue-400">
              {selectedIndex + 1} de {validSuggestions.length}
            </span>
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">✓</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip para información expandida */}
      {showTooltip && (
        <div
          className="fixed z-60 bg-gray-900 dark:bg-gray-700 text-white px-3 py-2 rounded-lg shadow-lg border border-gray-600 max-w-xs text-xs animate-in fade-in-0 zoom-in-95 duration-150"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateY(-100%)',
          }}
        >
          {tooltipContent}
          <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
        </div>
      )}
    </div>
  )
}