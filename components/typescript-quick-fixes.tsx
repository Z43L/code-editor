'use client'

import React, { useState, useEffect, useRef } from 'react'

interface TypeScriptQuickFixesProps {
  fixes: any[]
  isVisible: boolean
  position: { top: number; left: number }
  onClose: () => void
  onApplyFix: (fix: any) => void
}

export function TypeScriptQuickFixes({
  fixes,
  isVisible,
  position,
  onClose,
  onApplyFix,
}: TypeScriptQuickFixesProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cerrar cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])

  // Manejar navegación con teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isVisible || fixes.length === 0) return

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setSelectedIndex(prev => (prev + 1) % fixes.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          setSelectedIndex(prev => (prev - 1 + fixes.length) % fixes.length)
          break
        case 'Enter':
          event.preventDefault()
          onApplyFix(fixes[selectedIndex])
          onClose()
          break
        case 'Escape':
          event.preventDefault()
          onClose()
          break
      }
    }

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isVisible, fixes, selectedIndex, onApplyFix, onClose])

  if (!isVisible || fixes.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 bg-gray-800 dark:bg-gray-900 border border-gray-600 rounded-md shadow-lg max-w-md pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="p-2">
        <div className="text-xs text-gray-400 mb-2 font-medium">
          Quick Fixes
        </div>
        <div className="max-h-64 overflow-y-auto">
          {fixes.map((fix, index) => (
            <div
              key={index}
              className={`p-2 rounded cursor-pointer text-sm ${
                index === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-gray-700 text-gray-300'
              }`}
              onClick={() => {
                onApplyFix(fix)
                onClose()
              }}
            >
              <div className="font-medium">{fix.description}</div>
              {fix.changes && fix.changes.length > 0 && (
                <div className="text-xs text-gray-400 mt-1">
                  {fix.changes.length} change{fix.changes.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}