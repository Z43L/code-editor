'use client'

import React, { useState, useEffect, useRef } from 'react'
interface TypeScriptHoverTooltipProps {
  quickInfo: string | null
  isVisible: boolean
  position: { top: number; left: number }
  onClose: () => void
}

export function TypeScriptHoverTooltip({
  quickInfo,
  isVisible,
  position,
  onClose,
}: TypeScriptHoverTooltipProps) {
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
    if (!isVisible) return

    const timeout = setTimeout(() => {
      onClose()
    }, 3000) // 3 segundos

    return () => clearTimeout(timeout)
  }, [isVisible, onClose])

  if (!isVisible || !quickInfo) {
    return null
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-gray-800 dark:bg-gray-900 border border-gray-600 rounded-md shadow-lg p-3 max-w-xs pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="text-sm font-mono text-white whitespace-pre-wrap">
        {quickInfo}
      </div>
    </div>
  )
}