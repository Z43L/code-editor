import { useState, useEffect, useCallback } from 'react'

export interface TsCompletionEntry {
  name: string
  kind: string
  kindModifiers?: string
  sortText: string
  insertText?: string
  replacementSpan?: {
    start: number
    length: number
  }
  hasAction?: boolean
  source?: string
  data?: any
}

export interface TsQuickInfo {
  kind: string
  kindModifiers: string
  textSpan: {
    start: number
    length: number
  }
  displayParts: Array<{
    text: string
    kind: string
  }>
  documentation: Array<{
    text: string
    kind: string
  }>
  tags?: Array<{
    name: string
    text: string
  }>
}

export function useTypeScript() {
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    const checkElectron = () => {
      const electronDetected = typeof window !== 'undefined' &&
        (window as any).electronAPI !== undefined

      setIsElectron(electronDetected)
    }

    checkElectron()
  }, [])

  const updateFile = useCallback(async (fileName: string, content: string) => {
    if (!isElectron || !(window as any).electronAPI?.updateTsFile) {
      console.warn('TypeScript API not available')
      return { success: false, error: 'Not in Electron environment' }
    }

    try {
      return await (window as any).electronAPI.updateTsFile(fileName, content)
    } catch (error) {
      console.error('Error updating TypeScript file:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }, [isElectron])

  const getCompletions = useCallback(async (
    fileName: string,
    position: number,
    options: any = {}
  ): Promise<{ success: boolean; completions?: { entries: TsCompletionEntry[] } }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsCompletions) {
      console.warn('TypeScript completions API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsCompletions(fileName, position, options)
    } catch (error) {
      console.error('Error getting TypeScript completions:', error)
      return { success: false }
    }
  }, [isElectron])

  const getTsQuickInfo = useCallback(async (
    fileName: string,
    position: number
  ): Promise<{ success: boolean; quickInfo?: TsQuickInfo }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsQuickInfo) {
      console.warn('TypeScript quick info API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsQuickInfo(fileName, position)
    } catch (error) {
      console.error('Error getting TypeScript quick info:', error)
      return { success: false }
    }
  }, [isElectron])

  const getTsDiagnostics = useCallback(async (
    fileName: string
  ): Promise<{ success: boolean; errors?: any[] }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsDiagnostics) {
      console.warn('TypeScript diagnostics API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsDiagnostics(fileName)
    } catch (error) {
      console.error('Error getting TypeScript diagnostics:', error)
      return { success: false }
    }
  }, [isElectron])

  const getTsDefinition = useCallback(async (
    fileName: string,
    position: number
  ): Promise<{ success: boolean; definition?: any }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsDefinition) {
      console.warn('TypeScript definition API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsDefinition(fileName, position)
    } catch (error) {
      console.error('Error getting TypeScript definition:', error)
      return { success: false }
    }
  }, [isElectron])

  const getTsSignatureHelp = useCallback(async (
    fileName: string,
    position: number
  ): Promise<{ success: boolean; signatureHelp?: any }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsSignatureHelp) {
      console.warn('TypeScript signature help API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsSignatureHelp(fileName, position)
    } catch (error) {
      console.error('Error getting TypeScript signature help:', error)
      return { success: false }
    }
  }, [isElectron])

  const getTsQuickFixes = useCallback(async (
    fileName: string,
    start: number,
    length: number
  ): Promise<{ success: boolean; fixes?: any[] }> => {
    if (!isElectron || !(window as any).electronAPI?.getTsQuickFixes) {
      console.warn('TypeScript quick fixes API not available')
      return { success: false }
    }

    try {
      return await (window as any).electronAPI.getTsQuickFixes(fileName, start, length)
    } catch (error) {
      console.error('Error getting TypeScript quick fixes:', error)
      return { success: false }
    }
  }, [isElectron])

  const getSuggestions = useCallback(async (
    fileName: string,
    code: string,
    position: number
  ): Promise<TsCompletionEntry[]> => {
    if (!isElectron || !(window as any).electronAPI?.getSuggestions) {
      console.warn('TypeScript suggestions API not available')
      return []
    }

    try {
      return await (window as any).electronAPI.getSuggestions(fileName, code, position)
    } catch (error) {
      console.error('Error getting TypeScript suggestions:', error)
      return []
    }
  }, [isElectron])

  return {
    isElectron,
    updateFile,
    getCompletions,
    getTsQuickInfo,
    getTsDiagnostics,
    getTsDefinition,
    getTsSignatureHelp,
    getSuggestions,
    getTsQuickFixes
  }
}