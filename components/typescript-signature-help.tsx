'use client'

import React, { useState, useEffect, useRef } from 'react'
import { TsCompletionEntry } from '../hooks/use-typescript'

interface TypeScriptSignatureHelpProps {
  signatureHelp: any
  isVisible: boolean
  position: { top: number; left: number }
  onClose: () => void
}

export function TypeScriptSignatureHelp({
  signatureHelp,
  isVisible,
  position,
  onClose,
}: TypeScriptSignatureHelpProps) {
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

  if (!isVisible || !signatureHelp) {
    return null
  }

  const currentItem = signatureHelp.items[signatureHelp.selectedItemIndex]
  if (!currentItem) return null

  const formatDisplayParts = (parts: Array<{ text: string; kind: string }>) => {
    return parts.map((part, index) => {
      let className = 'text-gray-300'
      switch (part.kind) {
        case 'keyword':
          className = 'text-blue-400'
          break
        case 'string':
          className = 'text-green-400'
          break
        case 'number':
          className = 'text-orange-400'
          break
        case 'type':
        case 'className':
        case 'interfaceName':
          className = 'text-cyan-400'
          break
        case 'functionName':
        case 'methodName':
          className = 'text-purple-400'
          break
        case 'parameterName':
          className = 'text-yellow-400'
          break
      }

      return (
        <span key={index} className={className}>
          {part.text}
        </span>
      )
    })
  }

  const renderParameters = () => {
    const params = currentItem.parameters
    const currentParamIndex = signatureHelp.argumentIndex

    return (
      <div className="flex flex-wrap items-center gap-1 mt-2">
        {params.map((param: any, index: number) => (
          <React.Fragment key={index}>
            {index > 0 && formatDisplayParts(currentItem.separatorDisplayParts)}
            <span
              className={`px-1 py-0.5 rounded text-sm ${
                index === currentParamIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {formatDisplayParts(param.displayParts)}
              {param.isOptional && <span className="text-gray-500">?</span>}
            </span>
          </React.Fragment>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 bg-gray-800 dark:bg-gray-900 border border-gray-600 rounded-md shadow-lg p-3 max-w-md pointer-events-auto"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      {/* Firma de la función */}
      <div className="text-sm font-mono">
        {formatDisplayParts(currentItem.prefixDisplayParts)}
        {renderParameters()}
        {formatDisplayParts(currentItem.suffixDisplayParts)}
      </div>

      {/* Documentación */}
      {currentItem.documentation && currentItem.documentation.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div className="text-xs text-gray-400 leading-relaxed">
            {currentItem.documentation.map((doc: any, index: number) => (
              <span key={index}>{doc.text}</span>
            ))}
          </div>
        </div>
      )}

      {/* Información de sobrecargas */}
      {signatureHelp.items.length > 1 && (
        <div className="mt-2 pt-2 border-t border-gray-600 text-xs text-gray-500">
          {signatureHelp.selectedItemIndex + 1} of {signatureHelp.items.length} overloads
        </div>
      )}
    </div>
  )
}