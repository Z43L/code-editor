import { useState, useEffect } from 'react'

export function useElectron() {
  const [isElectron, setIsElectron] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    // Solo ejecutar en el cliente después de la hidratación
    const checkElectron = () => {
      const electronDetected = typeof window !== 'undefined' && 
        ((window as any).electronAPI !== undefined ||
         window.navigator.userAgent.includes('Electron') ||
         (window as any).require !== undefined)
      
      setIsElectron(electronDetected)
      setIsHydrated(true)
    }

    checkElectron()
  }, [])

  return { isElectron, isHydrated }
}