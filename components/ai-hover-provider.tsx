'use client'

import React, { createContext, useContext, ReactNode } from 'react'
import { useAIService } from '../hooks/use-ai-service'
import { AIHoverTooltip } from './ai-hover-tooltip'
import type { FileContextSnapshot } from '../lib/ai-service'

interface AIHoverContextType {
  showAIHover: (
    code: string,
    language: string,
    position: number,
    mousePosition: { top: number; left: number },
    symbol?: string,
    context?: string,
    projectContext?: Record<string, FileContextSnapshot>
  ) => void
  hideAIHover: () => void
}

const AIHoverContext = createContext<AIHoverContextType | null>(null)

export function useAIHover() {
  const context = useContext(AIHoverContext)
  if (!context) {
    throw new Error('useAIHover must be used within an AIHoverProvider')
  }
  return context
}

interface AIHoverProviderProps {
  children: ReactNode
}

export function AIHoverProvider({ children }: AIHoverProviderProps) {
  const { hoverState, showAIHover, hideAIHover } = useAIService()

  const contextValue: AIHoverContextType = {
    showAIHover,
    hideAIHover,
  }

  return (
    <AIHoverContext.Provider value={contextValue}>
      {children}

      <AIHoverTooltip
        explanation={hoverState.explanation}
        isVisible={hoverState.isVisible}
        isLoading={hoverState.isLoading}
        position={hoverState.position || { top: 0, left: 0 }}
        onClose={hideAIHover}
        error={hoverState.error}
      />
    </AIHoverContext.Provider>
  )
}

// Hook de conveniencia para usar en componentes de editor
export function useAIHoverTrigger() {
  const { showAIHover, hideAIHover } = useAIHover()

  const triggerAIHover = (
    code: string,
    language: string,
    position: number,
    mouseEvent: MouseEvent,
    symbol?: string,
    context?: string,
    projectContext?: Record<string, FileContextSnapshot>
  ) => {
    // Posicionar el tooltip directamente encima del cursor para que aparezca "delante"
    const mousePosition = {
      top: mouseEvent.clientY - 10, // Encima del cursor
      left: mouseEvent.clientX + 5, // Ligeramente a la derecha
    }

    showAIHover(code, language, position, mousePosition, symbol, context, projectContext)
  }

  return {
    triggerAIHover,
    hideAIHover,
  }
}