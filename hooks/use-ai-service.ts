import { useState, useCallback } from 'react'
import type { FileContextSnapshot } from '../lib/ai-service'

export interface AIHoverInfo {
  contents: {
    kind: 'markdown'
    value: string
  }
  range?: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface AIHoverRequest {
  code: string
  language: string
  position: number
  symbol?: string
  context?: string
  projectContext?: Record<string, FileContextSnapshot>
}

export interface AIHoverResponse {
  hover: AIHoverInfo | null
}

export interface AIHoverState {
  explanation: string | null
  isLoading: boolean
  error: string | null
  position: { top: number; left: number } | null
  isVisible: boolean
}

export function useAIService() {
  const [hoverState, setHoverState] = useState<AIHoverState>({
    explanation: null,
    isLoading: false,
    error: null,
    position: null,
    isVisible: false,
  })

  const getAIHover = useCallback(async (
    code: string,
    language: string,
    position: number,
    symbol?: string,
    context?: string,
    projectContext?: Record<string, FileContextSnapshot>
  ): Promise<AIHoverInfo | null> => {
    setHoverState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      const requestBody: AIHoverRequest = {
        code,
        language,
        position,
        symbol,
        context,
        projectContext
      }

      const response = await fetch('/api/ai/hover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`)
      }

      const data: AIHoverResponse = await response.json()

      if (data.hover) {
        setHoverState(prev => ({
          ...prev,
          explanation: data.hover!.contents.value,
          isLoading: false,
          error: null
        }))
        return data.hover
      }

      setHoverState(prev => ({ ...prev, isLoading: false }))
      return null
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setHoverState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage
      }))
      console.error('Error obteniendo hover de IA:', err)
      return null
    }
  }, [])

  const showAIHover = useCallback((
    code: string,
    language: string,
    position: number,
    mousePosition: { top: number; left: number },
    symbol?: string,
    context?: string,
    projectContext?: Record<string, FileContextSnapshot>
  ) => {
    setHoverState(prev => ({
      ...prev,
      position: mousePosition,
      isVisible: true,
      explanation: null,
      error: null,
      isLoading: true
    }))

    // Llamar a la API en background
    getAIHover(code, language, position, symbol, context, projectContext)
  }, [getAIHover])

  const hideAIHover = useCallback(() => {
    setHoverState(prev => ({
      ...prev,
      isVisible: false,
      explanation: null,
      error: null,
      isLoading: false
    }))
  }, [])

  const clearError = useCallback(() => {
    setHoverState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    hoverState,
    getAIHover,
    showAIHover,
    hideAIHover,
    clearError
  }
}