"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo } from "react"
import { ChevronDown, ChevronRight, File, Folder, Plus, Settings, FolderOpen, X, Search, RefreshCw, FolderPlus, FilePlus, RotateCcw } from "lucide-react"
import { useElectron } from "../hooks/use-electron"
import type { FileItem } from "./flutter-editor"
import type { AIProvider } from "../lib/ai-service"

interface FileTreeProps {
  activeFile: string
  onFileSelect: (filePath: string) => void
  files: Record<string, FileItem>
  onCreateFile: (filePath: string, content?: string) => void
  onLoadRealFileContent?: (filePath: string, content: string) => void
  editorSettings?: {
    lineNumbers: boolean
    syntaxHighlighting: boolean
    wordWrap: boolean
    autoResponses: boolean
    codeSuggestions: boolean
    chatFileName: string
  }
  onSettingsChange?: (settings: {
    lineNumbers: boolean
    syntaxHighlighting: boolean
    wordWrap: boolean
    autoResponses: boolean
    codeSuggestions: boolean
    chatFileName: string
  }) => void
  aiProvider?: AIProvider
  onAiProviderChange?: (provider: AIProvider) => void
  onWorkspacePathChange?: (path: string) => void
}

interface DirectoryEntry {
  name: string
  type: "file" | "directory"
  path: string
  fullPath?: string // Ruta absoluta completa (especialmente útil en Electron)
  children?: DirectoryEntry[]
  isExpanded?: boolean
  isLoaded?: boolean // Para lazy loading
  hasChildren?: boolean // Para indicar si tiene hijos sin cargarlos
  size?: number // Para archivos grandes
  modified?: Date // Fecha de modificación
  extension?: string // Extensión del archivo
  fileHandle?: any // Para acceso directo al archivo real
  directoryHandle?: any // Para acceso directo al directorio real
}

// Constantes para optimización
const MAX_INITIAL_DEPTH = 2
const MAX_VISIBLE_ITEMS = 1000
const CHUNK_SIZE = 100
const FILE_CACHE_SIZE = 50 // Máximo de archivos en cache
const CACHE_EXPIRY = 300000 // 5 minutos

// Cache de contenido de archivos
interface FileCache {
  content: string
  timestamp: number
  size: number
}

export function FileTree({ activeFile, onFileSelect, files, onCreateFile, onLoadRealFileContent, editorSettings, onSettingsChange, aiProvider, onAiProviderChange, onWorkspacePathChange }: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [newFileName, setNewFileName] = useState("")
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    targetPath: string
    targetType: 'file' | 'directory' | 'empty'
  } | null>(null)
  const [createMode, setCreateMode] = useState<'file' | 'folder' | null>(null)
  const [targetDirectory, setTargetDirectory] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"explorer" | "settings">("explorer")
  const [workingDirectory, setWorkingDirectory] = useState<string>("")  
  const [directoryStructure, setDirectoryStructure] = useState<DirectoryEntry[]>([])
  const [structureVersion, setStructureVersion] = useState(0) // Para forzar re-renderizado
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")  
  const [basePath, setBasePath] = useState<string>("")  
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())
  const [fileHandleCache, setFileHandleCache] = useState<Map<string, any>>(new Map())
  const [rootDirectoryHandle, setRootDirectoryHandle] = useState<any>(null)
  
  // Nuevos estados para optimización
  const [fileContentCache, setFileContentCache] = useState<Map<string, FileCache>>(new Map())
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<DirectoryEntry[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [virtualizedItems, setVirtualizedItems] = useState<DirectoryEntry[]>([])
  const [scrollPosition, setScrollPosition] = useState(0)
  const [directoryStats, setDirectoryStats] = useState<{
    totalFiles: number
    totalDirectories: number
    totalSize: number
    loadTime: number
  }>({ totalFiles: 0, totalDirectories: 0, totalSize: 0, loadTime: 0 })
  
  // Estados para filtros de búsqueda avanzada
  const [searchFilters, setSearchFilters] = useState({
    fileTypes: [] as string[],
    includeDirectories: true,
    caseSensitive: false,
    useRegex: false,
    maxResults: 100,
    searchInContent: false
  })
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [selectedSearchResult, setSelectedSearchResult] = useState<number>(-1)
  
  // Estados para drag & drop
  const [draggedItem, setDraggedItem] = useState<DirectoryEntry | null>(null)
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  // Estado para detectar si hay datos persistidos disponibles
  const [hasPersistedData, setHasPersistedData] = useState(false)
  
  const { isElectron } = useElectron()
  
  // Función para limpiar completamente el localStorage
  const clearFileTreeStorage = useCallback(() => {
    console.log('[DEBUG] Limpiando localStorage del FileTree')
    localStorage.removeItem('fileTree_workingDirectory')
    localStorage.removeItem('fileTree_basePath')
    localStorage.removeItem('fileTree_expandedFolders')
    localStorage.removeItem('fileTree_directoryStructure')
    setWorkingDirectory('')
    setBasePath('')
    setExpandedFolders(new Set())
    setDirectoryStructure([])
  }, [])

  // Función para validar y limpiar localStorage corrupto
  const validateAndCleanStorage = useCallback(() => {
    const savedWorkingDirectory = localStorage.getItem('fileTree_workingDirectory')
    if (savedWorkingDirectory && !savedWorkingDirectory.startsWith('/') && !savedWorkingDirectory.includes(':\\')) {
      // Es una ruta relativa, limpiar localStorage
      console.log('[DEBUG] Detectada ruta relativa en localStorage, limpiando:', savedWorkingDirectory)
      clearFileTreeStorage()
      return true
    }
    return false
  }, [clearFileTreeStorage])
  
  // Cargar estado persistido al inicializar
  useEffect(() => {
    const initializeFileTree = async () => {
      // Primero validar y limpiar localStorage corrupto
      if (validateAndCleanStorage()) {
        return // Si se limpió el localStorage, no continuar con la inicialización
      }

      const savedWorkingDirectory = localStorage.getItem('fileTree_workingDirectory')
      const savedBasePath = localStorage.getItem('fileTree_basePath')
      const savedExpandedFolders = localStorage.getItem('fileTree_expandedFolders')
      const savedDirectoryStructure = localStorage.getItem('fileTree_directoryStructure')
      
      if (savedWorkingDirectory && savedBasePath) {
        console.log('[DEBUG] Restaurando directorio de trabajo:', savedWorkingDirectory)
        
        // Validar que el directorio existe si estamos en Electron
        if (isElectron && (window as any).electronAPI) {
          try {
            const dirStats = await (window as any).electronAPI.getFileStats(savedWorkingDirectory)
            if (!dirStats || !dirStats.success || !dirStats.stats || !dirStats.stats.isDirectory()) {
              console.warn('[DEBUG] El directorio guardado no existe:', savedWorkingDirectory)
              clearFileTreeStorage()
              return
            }
          } catch (error) {
            console.warn('[DEBUG] Error al validar directorio guardado:', error)
            clearFileTreeStorage()
            return
          }
        }
        
        setWorkingDirectory(savedWorkingDirectory)
        setBasePath(savedBasePath)
        
        // Restaurar directorios expandidos
        if (savedExpandedFolders) {
          try {
            const expandedArray = JSON.parse(savedExpandedFolders)
            setExpandedFolders(new Set(expandedArray))
            console.log('[DEBUG] Directorios expandidos restaurados:', expandedArray.length)
          } catch (error) {
            console.error('[DEBUG] Error al restaurar directorios expandidos:', error)
          }
        }
        
        // Restaurar estructura de directorios
        if (savedDirectoryStructure) {
          try {
            const structure = JSON.parse(savedDirectoryStructure)
            setDirectoryStructure(structure)
            console.log('[DEBUG] Estructura de directorios restaurada:', structure.length, 'elementos')
          } catch (error) {
            console.error('[DEBUG] Error al restaurar estructura de directorios:', error)
          }
        }
      }
    }
    
    initializeFileTree()
  }, [isElectron, clearFileTreeStorage, validateAndCleanStorage])
  
  // Persistir directorio de trabajo cuando cambie
  useEffect(() => {
    if (workingDirectory && basePath) {
      localStorage.setItem('fileTree_workingDirectory', workingDirectory)
      localStorage.setItem('fileTree_basePath', basePath)
      console.log('[DEBUG] Directorio de trabajo persistido:', workingDirectory)
    }
  }, [workingDirectory, basePath])
  
  // Persistir directorios expandidos cuando cambien
  useEffect(() => {
    if (expandedFolders.size > 0) {
      const expandedArray = Array.from(expandedFolders)
      localStorage.setItem('fileTree_expandedFolders', JSON.stringify(expandedArray))
      console.log('[DEBUG] Directorios expandidos persistidos:', expandedArray.length)
    }
  }, [expandedFolders])
  
  // Persistir estructura de directorios cuando cambie
  useEffect(() => {
    if (directoryStructure.length > 0) {
      // Crear una versión limpia sin referencias circulares para localStorage
      const cleanStructure = JSON.parse(JSON.stringify(directoryStructure, (key, value) => {
        // Excluir propiedades que pueden causar referencias circulares o ser muy grandes
        if (key === 'fileHandle' || key === 'directoryHandle') {
          return undefined
        }
        return value
      }))
      
      localStorage.setItem('fileTree_directoryStructure', JSON.stringify(cleanStructure))
      console.log('[DEBUG] Estructura de directorios persistida:', cleanStructure.length, 'elementos')
    }
  }, [directoryStructure])
  
  // Debug: Log directoryStructure changes
  useEffect(() => {
    console.log('[DEBUG] directoryStructure changed:', {
      length: directoryStructure.length,
      structure: directoryStructure,
      isLoading,
      workingDirectory
    })
  }, [directoryStructure, isLoading, workingDirectory])

  // Detectar si hay datos persistidos disponibles
  useEffect(() => {
    const checkPersistedData = () => {
      const savedWorkingDirectory = localStorage.getItem('fileTree_workingDirectory')
      const savedBasePath = localStorage.getItem('fileTree_basePath')
      const savedDirectoryStructure = localStorage.getItem('fileTree_directoryStructure')
      
      const hasPersisted = !!(savedWorkingDirectory && savedBasePath && savedDirectoryStructure && !workingDirectory)
      setHasPersistedData(hasPersisted)
      console.log('[DEBUG] Datos persistidos detectados:', hasPersisted)
    }
    
    checkPersistedData()
  }, [workingDirectory])

  // Función helper para actualizar estructura y forzar re-renderizado
  const updateDirectoryStructureWithVersion = useCallback((newStructure: DirectoryEntry[]) => {
    setDirectoryStructure(newStructure)
    setStructureVersion(prev => prev + 1)
  }, [])

  // Función para refrescar la estructura de directorios (optimizada para respuesta instantánea)
  const refreshDirectoryStructure = useCallback(async () => {
    if (!workingDirectory || !basePath) {
      return
    }

    // Limpiar errores inmediatamente
    setError("")

    try {
      if (isElectron && (window as any).electronAPI) {
        // En Electron, volver a cargar la estructura desde el sistema de archivos
        const result = await (window as any).electronAPI.readDirectoryStructure(basePath)
        if (result && result.structure) {
          // Actualización instantánea y directa del estado
          setDirectoryStructure(result.structure)
          setStructureVersion(prev => prev + 1)
        }
      } else if (rootDirectoryHandle) {
        // En navegadores, usar el directoryHandle guardado
        const structure = await readDirectoryRecursively(rootDirectoryHandle, "", 0, basePath)
        // Actualización instantánea y directa del estado
        setDirectoryStructure(structure)
        setStructureVersion(prev => prev + 1)
      }
    } catch (error) {
      console.error('[DEBUG] Error refreshing directory structure:', error)
      setError(`Error al refrescar: ${(error as Error).message}`)
    }
  }, [workingDirectory, basePath, isElectron, rootDirectoryHandle])

  // Exponer la función de refrescado globalmente para que pueda ser llamada desde otros componentes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).refreshFileTree = refreshDirectoryStructure
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).refreshFileTree
      }
    }
  }, [refreshDirectoryStructure])

  // Handle context menu close on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        closeContextMenu()
      }
    }

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])
  
  // Use default settings if not provided
  const currentSettings = editorSettings || {
    lineNumbers: true,
    syntaxHighlighting: true,
    wordWrap: false,
    autoResponses: true,
    codeSuggestions: true,
    chatFileName: "chat.md",
  }

  // Use default AI provider if not provided
  const currentAiProvider = aiProvider || {
    type: 'openrouter' as const,
    apiKey: '',
    model: 'anthropic/claude-3.5-sonnet'
  }

  const handleAiProviderChange = (newProvider: AIProvider) => {
    if (onAiProviderChange) {
      onAiProviderChange(newProvider)
    }
  }

  // Function to get real file content from cached file handle
  const getRealFileContent = async (filePath: string): Promise<string | null> => {
    try {
      const fileHandle = fileHandleCache.get(filePath)
      if (fileHandle && fileHandle.kind === 'file') {
        const file = await fileHandle.getFile()
        const content = await file.text()
        return content
      }
      return null
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error)
      return null
    }
  }

  // Helper function to find entry by path
  const findEntryByPath = useCallback((entries: DirectoryEntry[], targetPath: string): DirectoryEntry | null => {
    for (const entry of entries) {
      if (entry.path === targetPath) {
        return entry
      }
      if (entry.children) {
        const found = findEntryByPath(entry.children, targetPath)
        if (found) return found
      }
    }
    return null
  }, [])

  // Lazy load directory children
  const loadDirectoryChildren = useCallback(async (dirPath: string) => {
    if (loadingPaths.has(dirPath)) return
    
    setLoadingPaths(prev => new Set(prev).add(dirPath))
    
    try {
      // En Electron, siempre usar el fallback
      if ('showDirectoryPicker' in window && !isElectron) {
        // For File System Access API, we need to re-traverse to the specific directory
        // This is a simplified approach - in a real implementation you'd cache directory handles
        const entry = findEntryByPath(directoryStructure, dirPath)
        if (entry) {
          // Mark as loaded to prevent re-loading
          entry.isLoaded = true
          setDirectoryStructure([...directoryStructure])
        }
      }
    } catch (err) {
      console.warn(`Error loading children for ${dirPath}:`, err)
    } finally {
      setLoadingPaths(prev => {
        const newSet = new Set(prev)
        newSet.delete(dirPath)
        return newSet
      })
    }
  }, [directoryStructure, loadingPaths, findEntryByPath])



  const handleCreateFile = async () => {
    if (newFileName.trim()) {
      try {
        const fileName = newFileName.trim()
        const fullPath = targetDirectory ? `${targetDirectory}/${fileName}` : fileName
        
        if (isElectron && (window as any).electronAPI) {
          // En Electron, usar la API para crear archivos
          const absolutePath = getAbsolutePath(fullPath)
          console.log('🔧 [DEBUG] Creating file:', absolutePath)
          const result = await (window as any).electronAPI.createFile(absolutePath, "")
          
          if (result.success) {
            console.log('✅ [DEBUG] File created successfully, refreshing directory structure...')
            // Refrescar la estructura del directorio
            await refreshDirectoryStructure()
            console.log('🔄 [DEBUG] Directory structure refreshed after file creation')
            // Expandir la carpeta padre si existe
            if (targetDirectory) {
              setExpandedFolders(prev => new Set(prev).add(targetDirectory))
            }
            // Abrir el archivo recién creado
            onFileSelect(fullPath)
          } else {
            setError(`Error al crear archivo: ${result.error}`)
          }
        } else if ('showSaveFilePicker' in window && !isElectron) {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [
              {
                description: 'Text files',
                accept: {
                  'text/plain': ['.txt', '.md', '.js', '.ts', '.tsx', '.jsx', '.css', '.html', '.json'],
                },
              },
            ],
          })
          
          const writable = await fileHandle.createWritable()
          await writable.write("")
          await writable.close()
          
          // Actualizar la estructura de archivos usando la misma función que funciona en carpetas
          await refreshDirectoryStructure()
          // Expandir la carpeta padre si existe
          if (targetDirectory) {
            setExpandedFolders(prev => new Set(prev).add(targetDirectory))
          }
        } else {
          // Fallback para navegadores que no soportan File System Access API
          onCreateFile(fullPath, "")
        }
        
        setNewFileName("")
        setIsCreatingFile(false)
        setCreateMode(null)
        setTargetDirectory("")
        setError("")
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(`Error al crear archivo: ${(err as Error).message}`)
        }
      }
    }
  }

  const handleCreateFolder = async () => {
    if (newFolderName.trim()) {
      try {
        const folderName = newFolderName.trim()
        const fullPath = targetDirectory ? `${targetDirectory}/${folderName}` : folderName
        
        if (isElectron && (window as any).electronAPI) {
          // En Electron, usar la API para crear carpetas
          const absolutePath = getAbsolutePath(fullPath)
          console.log('📁 [DEBUG] Creating folder:', absolutePath)
          const result = await (window as any).electronAPI.createDirectory(absolutePath)
          
          if (result.success) {
            console.log('✅ [DEBUG] Folder created successfully, refreshing directory structure...')
            // Refrescar la estructura del directorio
            await refreshDirectoryStructure()
            console.log('🔄 [DEBUG] Directory structure refreshed after folder creation')
            // Expandir la carpeta padre si existe
            if (targetDirectory) {
              setExpandedFolders(prev => new Set(prev).add(targetDirectory))
            }
          } else {
            setError(`Error al crear carpeta: ${result.error}`)
          }
        } else {
          // Para navegadores, mostrar mensaje de que no es compatible
          setError("La creación de carpetas no está disponible en el navegador")
        }
        
        setNewFolderName("")
        setIsCreatingFolder(false)
        setCreateMode(null)
        setTargetDirectory("")
        setError("")
      } catch (err) {
        setError(`Error al crear carpeta: ${(err as Error).message}`)
      }
    }
  }

  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'directory' | 'empty') => {
    e.preventDefault()
    e.stopPropagation()
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      targetPath: path,
      targetType: type
    })
  }

  const closeContextMenu = () => {
    setContextMenu(null)
  }

  const startCreateFile = (directory?: string) => {
    setTargetDirectory(directory || "")
    setCreateMode('file')
    setIsCreatingFile(true)
    setNewFileName("")
    closeContextMenu()
  }

  const startCreateFolder = (directory?: string) => {
    setTargetDirectory(directory || "")
    setCreateMode('folder')
    setIsCreatingFolder(true)
    setNewFolderName("")
    closeContextMenu()
  }

  // Cerrar menú contextual al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      closeContextMenu()
    }
    
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  // Funciones para drag & drop
  const handleDragStart = (e: React.DragEvent, entry: DirectoryEntry) => {
    setDraggedItem(entry)
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', entry.path)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverTarget(null)
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => {
    e.preventDefault()
    
    // Solo permitir drop en directorios
    if (targetType === 'directory') {
      e.dataTransfer.dropEffect = 'move'
      setDragOverTarget(targetPath)
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  const handleDragLeave = () => {
    setDragOverTarget(null)
  }

  const handleDrop = async (e: React.DragEvent, targetPath: string, targetType: 'file' | 'directory') => {
    e.preventDefault()
    
    if (!draggedItem) {
      return
    }

    // Permitir drop en archivos (se moverá al directorio padre del archivo)
    // y en directorios (se moverá dentro del directorio)
    let finalTargetPath = targetPath
    if (targetType === 'file') {
      // Si se hace drop en un archivo, mover al directorio padre de ese archivo
      finalTargetPath = targetPath.substring(0, targetPath.lastIndexOf('/'))
    }

    // No permitir mover un directorio dentro de sí mismo
    if (draggedItem.type === 'directory' && finalTargetPath.startsWith(draggedItem.path)) {
      setError("No se puede mover una carpeta dentro de sí misma")
      handleDragEnd()
      return
    }

    // No hacer nada si se suelta en el mismo directorio
    const draggedParentPath = draggedItem.path.substring(0, draggedItem.path.lastIndexOf('/'))
    if (draggedParentPath === finalTargetPath) {
      handleDragEnd()
      return
    }

    try {
      // Construir la ruta de destino correcta
      // Si estamos haciendo drop al directorio raíz, usar solo el nombre del archivo
      // Si no, usar la ruta completa con el directorio de destino
      let newPath: string
      if (finalTargetPath === workingDirectory) {
        // Drop al directorio raíz - mover directamente al directorio de trabajo
        newPath = draggedItem.name
      } else {
        // Drop a un subdirectorio - usar la ruta completa
        newPath = `${finalTargetPath}/${draggedItem.name}`
      }
      
      if (isElectron && (window as any).electronAPI) {
        const sourcePath = getAbsolutePath(draggedItem.path)
        const destPath = getAbsolutePath(newPath)
        
        console.log('🚚 [DEBUG] Moving file/folder from:', sourcePath, 'to:', destPath)
        const result = await (window as any).electronAPI.moveFileOrDirectory(sourcePath, destPath)
        
        if (result.success) {
          console.log('✅ [DEBUG] File/folder moved successfully, refreshing directory structure...')
          
          // Expandir tanto la carpeta de origen como la de destino para ver los cambios
          setExpandedFolders(prev => {
            const newSet = new Set(prev)
            newSet.add(finalTargetPath) // Carpeta de destino
            if (draggedParentPath) {
              newSet.add(draggedParentPath) // Carpeta de origen
            }
            return newSet
          })
          
          // Refrescar la estructura del directorio inmediatamente sin delay
          refreshDirectoryStructure().then(() => {
            console.log('🔄 [DEBUG] Directory structure refreshed after move operation')
          })
        } else {
          setError(`Error al mover: ${result.error}`)
        }
      } else {
        setError("La función de mover archivos no está disponible en el navegador")
      }
    } catch (err) {
      setError(`Error al mover: ${(err as Error).message}`)
    }

    handleDragEnd()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (createMode === 'file') {
        handleCreateFile()
      } else if (createMode === 'folder') {
        handleCreateFolder()
      }
    } else if (e.key === "Escape") {
      setIsCreatingFile(false)
      setIsCreatingFolder(false)
      setNewFileName("")
      setNewFolderName("")
      setCreateMode(null)
      setTargetDirectory("")
    }
  }

  // Debug: Log Electron context availability
  useEffect(() => {
    console.log('[DEBUG] Window object:', typeof window)
    console.log('[DEBUG] electronAPI available:', !!(window as any).electronAPI)
    console.log('[DEBUG] isElectron:', isElectron)
    if ((window as any).electronAPI) {
      console.log('[DEBUG] electronAPI methods:', Object.keys((window as any).electronAPI))
    }
  }, [])

  // Monitor directoryStructure changes
  useEffect(() => {
    console.log('🔄 [FRONTEND] directoryStructure changed, length:', directoryStructure.length)
    if (directoryStructure.length > 0) {
      console.log('📁 [FRONTEND] First item:', directoryStructure[0])
    }
  }, [directoryStructure])

  const loadDirectoryStructure = useCallback(async () => {
    if (!workingDirectory) return
    
    // Si ya tenemos estructura de directorio (desde Electron API), no hacer nada
    if (directoryStructure.length > 0) {
      console.log('🔄 [FRONTEND] Directory structure already loaded, skipping loadDirectoryStructure')
      return
    }
    
    setIsLoading(true)
    setError("")
    
    try {
      // En Electron, siempre usar el fallback
      if ('showDirectoryPicker' in window && !isElectron) {
        // Use File System Access API for real directory reading
        const directoryHandle = await (window as any).showDirectoryPicker()
        const structure = await readDirectoryRecursively(directoryHandle, directoryHandle.name, 0)
        setDirectoryStructure(structure)
        setWorkingDirectory(directoryHandle.name)
      } else {
        // Fallback: Use the file list from the input
        console.log('🔄 [FRONTEND] In Electron mode, waiting for Electron API data...')
        // No resetear el estado aquí, esperar a que lleguen los datos del Electron API
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(`Error al cargar directorio: ${(err as Error).message}`)
      }
    } finally {
        setIsLoading(false)
    }
  }, [workingDirectory, isElectron, directoryStructure.length])

  // Cache optimizado para contenido de archivos
  const getCachedFileContent = useCallback((filePath: string): string | null => {
    const cached = fileContentCache.get(filePath)
    if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.content
    }
    return null
  }, [fileContentCache])

  const setCachedFileContent = useCallback((filePath: string, content: string) => {
    const newCache = new Map(fileContentCache)
    
    // Limpiar cache si está lleno
    if (newCache.size >= FILE_CACHE_SIZE) {
      const oldestKey = Array.from(newCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0]
      newCache.delete(oldestKey)
    }
    
    newCache.set(filePath, {
      content,
      timestamp: Date.now(),
      size: content.length
    })
    
    setFileContentCache(newCache)
  }, [fileContentCache])

  // Función para verificar si un archivo existe
  const fileExists = useCallback(async (filePath: string): Promise<boolean> => {
    try {
      if (isElectron && (window as any).electronAPI) {
        const result = await (window as any).electronAPI.fileExists(filePath)
        return result.exists || false
      }
      
      // Fallback para navegadores
      const fileHandle = fileHandleCache.get(filePath)
      return fileHandle && fileHandle.kind === 'file'
    } catch (error) {
      return false
    }
  }, [isElectron, fileHandleCache])

  // Función optimizada para cargar contenido de archivos
  const loadFileContentOptimized = useCallback(async (filePath: string): Promise<string> => {
    // Verificar cache primero
    const cached = getCachedFileContent(filePath)
    if (cached) {
      console.log('[DEBUG] Using cached content for:', filePath)
      return cached
    }

    try {
      if (isElectron && (window as any).electronAPI) {
        const result = await (window as any).electronAPI.readFile(filePath)
        if (result.success) {
          setCachedFileContent(filePath, result.content)
          return result.content
        }
        
        // Verificar si es un error de archivo no encontrado
        if (result.error && result.error.includes('ENOENT')) {
          throw new Error(`File not found: ${filePath}`)
        }
        
        throw new Error(result.error || 'Failed to read file')
      }
      
      // Fallback para navegadores
      const fileHandle = fileHandleCache.get(filePath)
      if (fileHandle && fileHandle.kind === 'file') {
        const file = await fileHandle.getFile()
        const content = await file.text()
        setCachedFileContent(filePath, content)
        return content
      }
      
      throw new Error('File not accessible')
    } catch (error) {
      // Solo mostrar error en consola si no es un archivo no encontrado
      if (!(error instanceof Error && error.message.includes('File not found'))) {
        console.error(`Error loading file ${filePath}:`, error)
      }
      throw error
    }
  }, [isElectron, fileHandleCache, getCachedFileContent, setCachedFileContent])

  // Función auxiliar para actualizar estructura de directorios
  const updateDirectoryStructure = useCallback((
    structure: DirectoryEntry[], 
    targetPath: string, 
    newChildren: DirectoryEntry[]
  ): DirectoryEntry[] => {
    return structure.map(entry => {
      if (entry.path === targetPath && entry.type === 'directory') {
        return {
          ...entry,
          children: newChildren,
          isLoaded: true,
          hasChildren: newChildren.length > 0
        }
      }
      if (entry.children) {
        return {
          ...entry,
          children: updateDirectoryStructure(entry.children, targetPath, newChildren)
        }
      }
      return entry
    })
  }, [])

  // Helper function to construct absolute path
  const getAbsolutePath = useCallback((relativePath: string): string => {
    if (!basePath) {
      console.warn('Base path not set, using relative path:', relativePath)
      return relativePath
    }
    
    // Improved detection of absolute paths
    const isUnixAbsolute = relativePath.startsWith('/')
    const isWindowsAbsolute = relativePath.includes(':')
    const containsBasePath = relativePath.includes(basePath)
    
    // If the path is already absolute, return it as is
    if (isUnixAbsolute || isWindowsAbsolute || containsBasePath) {
      console.log('[DEBUG] Path already absolute:', { relativePath, basePath })
      return relativePath
    }
    
    // Construct absolute path by joining base path with relative path
    const separator = basePath.includes('\\') ? '\\' : '/'
    // Ensure no double separators
    const cleanBasePath = basePath.endsWith('/') || basePath.endsWith('\\') ? basePath.slice(0, -1) : basePath
    const cleanRelativePath = relativePath.startsWith('/') || relativePath.startsWith('\\') ? relativePath.slice(1) : relativePath
    const absolutePath = cleanBasePath + separator + cleanRelativePath
    
    console.log('[DEBUG] Constructed absolute path:', { 
      relativePath, 
      basePath, 
      absolutePath,
      cleanBasePath,
      cleanRelativePath
    })
    return absolutePath
  }, [basePath])

  // Lazy loading optimizado para subdirectorios
  const loadDirectoryChildrenOptimized = useCallback(async (dirPath: string) => {
    if (loadingPaths.has(dirPath)) return
    
    setLoadingPaths(prev => new Set(prev).add(dirPath))
    
    try {
      if (isElectron && (window as any).electronAPI) {
        // Construir ruta absoluta para el directorio
        const absoluteDirPath = getAbsolutePath(dirPath)
        console.log('[DEBUG] Loading subdirectory with absolute path:', { dirPath, absoluteDirPath, basePath })
        
        const result = await (window as any).electronAPI.loadSubdirectory(absoluteDirPath, basePath)
        if (result.success) {
          // Actualizar la estructura con los nuevos hijos
          setDirectoryStructure(prev => updateDirectoryStructure(prev, dirPath, result.structure))
        }
      }
    } catch (error) {
      console.error(`Error loading children for ${dirPath}:`, error)
    } finally {
      setLoadingPaths(prev => {
        const newSet = new Set(prev)
        newSet.delete(dirPath)
        return newSet
      })
    }
  }, [isElectron, basePath, loadingPaths, updateDirectoryStructure, getAbsolutePath])

  // Optimized toggle folder with lazy loading
  const toggleFolder = useCallback(async (folderPath: string) => {
    const newExpanded = new Set(expandedFolders)
    const isCurrentlyExpanded = newExpanded.has(folderPath)
    
    if (isCurrentlyExpanded) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
      
      // Lazy load children if not loaded yet
      const entry = findEntryByPath(directoryStructure, folderPath)
      if (entry && entry.type === 'directory' && !entry.isLoaded) {
        await loadDirectoryChildrenOptimized(folderPath)
      }
    }
    setExpandedFolders(newExpanded)
  }, [expandedFolders, directoryStructure, loadDirectoryChildrenOptimized, findEntryByPath])

  // Función de búsqueda local recursiva con filtros avanzados
  const searchLocalFiles = useCallback((entries: DirectoryEntry[], query: string): DirectoryEntry[] => {
    const results: DirectoryEntry[] = []
    let searchTerm = searchFilters.caseSensitive ? query : query.toLowerCase()
    
    // Compilar regex si está habilitado
    let regex: RegExp | null = null
    if (searchFilters.useRegex) {
      try {
        regex = new RegExp(query, searchFilters.caseSensitive ? 'g' : 'gi')
      } catch (error) {
        console.warn('Invalid regex pattern:', query)
        return []
      }
    }

    const searchRecursive = (items: DirectoryEntry[]) => {
      for (const entry of items) {
        let matches = false
        const entryName = searchFilters.caseSensitive ? entry.name : entry.name.toLowerCase()
        
        // Filtrar por tipo (archivo/directorio)
        if (!searchFilters.includeDirectories && entry.type === 'directory') {
          // Continuar buscando en subdirectorios aunque no incluya directorios en resultados
          if (entry.children && entry.children.length > 0) {
            searchRecursive(entry.children)
          }
          continue
        }

        // Filtrar por tipos de archivo
        if (searchFilters.fileTypes.length > 0 && entry.type === 'file') {
          const hasMatchingExtension = searchFilters.fileTypes.some(type => 
            entry.extension?.toLowerCase() === type.toLowerCase() ||
            entry.name.toLowerCase().endsWith(type.toLowerCase())
          )
          if (!hasMatchingExtension) {
            if (entry.children && entry.children.length > 0) {
              searchRecursive(entry.children)
            }
            continue
          }
        }

        // Realizar búsqueda por nombre
        if (searchFilters.useRegex && regex) {
          matches = regex.test(entry.name)
        } else if (query.startsWith('.') && entry.extension) {
          // Búsqueda por extensión
          const extSearch = searchFilters.caseSensitive ? entry.extension : entry.extension.toLowerCase()
          matches = extSearch === searchTerm
        } else {
          // Búsqueda por nombre
          matches = entryName.includes(searchTerm)
        }

        // Búsqueda por contenido (solo para archivos y contenido ya disponible)
        if (!matches && searchFilters.searchInContent && entry.type === 'file') {
          try {
            let content = ''
            
            // Intentar obtener contenido del cache de archivos primero
            const cachedFile = fileContentCache.get(entry.path || '')
            if (cachedFile && Date.now() - cachedFile.timestamp < CACHE_EXPIRY) {
              content = cachedFile.content
            } else if (entry.path && files[entry.path]) {
              // Usar contenido del editor si está disponible
              content = files[entry.path].content || ''
            }

            if (content) {
              const contentToSearch = searchFilters.caseSensitive ? content : content.toLowerCase()
              if (searchFilters.useRegex && regex) {
                matches = regex.test(content)
              } else {
                matches = contentToSearch.includes(searchTerm)
              }
            }
          } catch (error) {
            console.warn('Error searching in file content:', error)
          }
        }

        if (matches) {
          results.push({
            ...entry,
            path: entry.path || entry.name
          })
        }

        // Buscar recursivamente en subdirectorios
        if (entry.children && entry.children.length > 0) {
          searchRecursive(entry.children)
        }
      }
    }

    searchRecursive(entries)
    return results.slice(0, searchFilters.maxResults)
  }, [searchFilters])



  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery) {
        // Ejecutar búsqueda directamente sin depender del callback searchFiles
        setIsSearching(true)
        
        const performSearch = async () => {
          try {
            if (!workingDirectory) {
              console.warn('No working directory set')
              setSearchResults([])
              return
            }

            // Validar que el directorio existe
             if (isElectron && (window as any).electronAPI?.getFileStats) {
               const dirStats = await (window as any).electronAPI.getFileStats(workingDirectory)
               if (!dirStats.success || !dirStats.stats.isDirectory()) {
                 console.warn('Working directory does not exist or is not a directory:', workingDirectory)
                 // NO limpiar el localStorage aquí - solo usar búsqueda local
                 const localResults = searchLocalFiles(directoryStructure, searchQuery)
                 setSearchResults(localResults)
                 return
               }
             }

             // Búsqueda con Electron API
             if (isElectron && (window as any).electronAPI?.searchFiles) {
               const results = await (window as any).electronAPI.searchFiles(workingDirectory, searchQuery, {
                caseSensitive: searchFilters.caseSensitive,
                useRegex: searchFilters.useRegex,
                includeDirectories: searchFilters.includeDirectories,
                fileTypes: searchFilters.fileTypes,
                searchInContent: searchFilters.searchInContent,
                maxResults: searchFilters.maxResults
              })
              setSearchResults(results || [])
            } else {
              // Fallback a búsqueda local
              const localResults = searchLocalFiles(directoryStructure, searchQuery)
              setSearchResults(localResults)
            }
          } catch (error) {
            console.error('Error searching files:', error)
            // Fallback a búsqueda local en caso de error
            const localResults = searchLocalFiles(directoryStructure, searchQuery)
            setSearchResults(localResults)
          } finally {
            setIsSearching(false)
          }
        }

        performSearch()
      } else {
        setSearchResults([])
        setSelectedSearchResult(-1)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [searchQuery, workingDirectory, isElectron, directoryStructure, searchFilters, searchLocalFiles])



  // Función optimizada para manejar selección de archivos
  const handleFileSelectOptimized = useCallback(async (filePath: string) => {
    try {
      // Si el archivo ya está en el estado, solo cambiar el activo
      if (files[filePath]) {
        onFileSelect(filePath)
        return
      }

      // Determinar la ruta absoluta correcta
      let absolutePath: string
      
      // En Electron, buscar el archivo en la estructura para obtener su fullPath
      if (isElectron && directoryStructure.length > 0) {
        const findFileInStructure = (entries: DirectoryEntry[], targetPath: string): DirectoryEntry | null => {
          for (const entry of entries) {
            if (entry.type === 'file' && entry.path === targetPath) {
              return entry
            }
            if (entry.type === 'directory' && entry.children) {
              const found = findFileInStructure(entry.children, targetPath)
              if (found) return found
            }
          }
          return null
        }
        
        const fileEntry = findFileInStructure(directoryStructure, filePath)
        if (fileEntry && (fileEntry as any).fullPath) {
          absolutePath = (fileEntry as any).fullPath
        } else {
          // Fallback: construir ruta absoluta usando basePath
          absolutePath = getAbsolutePath(filePath)
        }
      } else {
        // Para navegadores o cuando no hay estructura, usar el método original
        const isUnixAbsolute = filePath.startsWith('/')
        const isWindowsAbsolute = filePath.includes(':')
        const containsBasePath = basePath && filePath.includes(basePath)
        const isAlreadyAbsolute = isUnixAbsolute || isWindowsAbsolute || containsBasePath
        
        absolutePath = isAlreadyAbsolute ? filePath : getAbsolutePath(filePath)
      }
      
      console.log('[DEBUG] Loading file with absolute path:', { 
        filePath, 
        absolutePath, 
        basePath,
        isElectron
      })

      // Verificar si el archivo existe antes de intentar cargarlo
      const exists = await fileExists(absolutePath)
      if (!exists) {
        const fileName = filePath.split('/').pop() || filePath
        const errorContent = `// File not found: ${fileName}\n// Path: ${absolutePath}\n// This file may have been moved or deleted.`
        onCreateFile(filePath, errorContent)
        onFileSelect(filePath)
        
        // Notificar al componente padre con el contenido de error
        if (onLoadRealFileContent) {
          onLoadRealFileContent(filePath, errorContent)
        }
        return
      }

      // Cargar contenido del archivo de forma asíncrona usando ruta absoluta
      const content = await loadFileContentOptimized(absolutePath)
      
      // Crear archivo en el estado con el contenido real
      onCreateFile(filePath, content)
      
      // IMPORTANTE: Notificar al componente padre ANTES de seleccionar el archivo
      // Esto asegura que el contenido se actualice correctamente en el editor
      if (onLoadRealFileContent) {
        onLoadRealFileContent(filePath, content)
      }
      
      // Seleccionar el archivo después de cargar el contenido
      onFileSelect(filePath)
      
    } catch (error) {
      const fileName = filePath.split('/').pop() || filePath
      let errorContent: string
      
      // Manejar diferentes tipos de errores
      if (error instanceof Error && error.message.includes('File not found')) {
        // Para archivos no encontrados, crear un archivo con mensaje informativo
        errorContent = `// File not found: ${fileName}\n// Path: ${filePath}\n// This file may have been moved or deleted.`
      } else {
        // Para otros errores, mostrar en consola y crear archivo con error
        console.error('Error loading file:', error)
        errorContent = `// Error loading file: ${error}\n// File: ${fileName}`
      }
      
      onCreateFile(filePath, errorContent)
      
      // Notificar al componente padre con el contenido de error
      if (onLoadRealFileContent) {
        onLoadRealFileContent(filePath, errorContent)
      }
      
      onFileSelect(filePath)
    }
  }, [files, onFileSelect, onCreateFile, onLoadRealFileContent, loadFileContentOptimized, fileExists, getAbsolutePath])

  // Navegación con teclado en resultados de búsqueda
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSearchResult(prev => 
          prev < searchResults.length - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSearchResult(prev => 
          prev > 0 ? prev - 1 : searchResults.length - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSearchResult >= 0 && selectedSearchResult < searchResults.length) {
          const selectedFile = searchResults[selectedSearchResult]
          handleFileSelectOptimized(selectedFile.path)
          setSearchQuery('')
          setSearchResults([])
          setSelectedSearchResult(-1)
        }
        break
      case 'Escape':
        e.preventDefault()
        setSearchQuery('')
        setSearchResults([])
        setSelectedSearchResult(-1)
        break
    }
  }, [searchResults, selectedSearchResult, handleFileSelectOptimized])

  // Reset selected result when search results change
  useEffect(() => {
    setSelectedSearchResult(-1)
  }, [searchResults])

  // Optimized recursive function with depth limiting and lazy loading
  const readDirectoryRecursively = async (
    directoryHandle: any, 
    relativePath: string, 
    currentDepth: number = 0,
    rootBasePath?: string
  ): Promise<DirectoryEntry[]> => {
    const entries: DirectoryEntry[] = []
    
    // Use the root base path for absolute path construction
    const currentBasePath = rootBasePath || basePath
    
    try {
      for await (const [name, handle] of directoryHandle.entries()) {
        // Skip hidden files and common build/cache directories for performance
        if (name.startsWith('.') || 
            ['node_modules', 'dist', 'build', '.next', '.git', 'coverage'].includes(name)) {
          continue
        }
        
        const relativeFullPath = relativePath ? `${relativePath}/${name}` : name
        // Generate absolute path by combining base path with relative path
        const absolutePath = currentBasePath ? `${currentBasePath}/${relativeFullPath}` : relativeFullPath
        
        if (handle.kind === 'directory') {
          // Cache directory handle using absolute path
          setFileHandleCache(prev => new Map(prev).set(absolutePath, handle))
          
          const entry: DirectoryEntry = {
            name,
            type: 'directory',
            path: absolutePath, // Store absolute path
            children: [],
            isExpanded: false,
            isLoaded: currentDepth < MAX_INITIAL_DEPTH,
            directoryHandle: handle
          }
          
          // Only load children up to initial depth for performance
          if (currentDepth < MAX_INITIAL_DEPTH) {
            entry.children = await readDirectoryRecursively(handle, relativeFullPath, currentDepth + 1, currentBasePath)
          }
          
          entries.push(entry)
        } else if (handle.kind === 'file') {
          // Cache file handle using absolute path
          setFileHandleCache(prev => new Map(prev).set(absolutePath, handle))
          
          // Get file size for large file handling
          let size = 0
          try {
            const file = await handle.getFile()
            size = file.size
          } catch (e) {
            // Ignore size errors
          }
          
          entries.push({
            name,
            type: 'file',
            path: absolutePath, // Store absolute path
            size,
            isLoaded: true,
            fileHandle: handle
          })
        }
      }
    } catch (err) {
      console.warn(`Error reading directory ${relativePath}:`, err)
    }
    
    // Sort entries: directories first, then files, both alphabetically
    return entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  const testElectronCommunication = async () => {
    if (isElectron && (window as any).electronAPI) {
      try {
        console.log('[DEBUG] Testing Electron communication...')
        const result = await (window as any).electronAPI.testPing()
        console.log('[DEBUG] Test ping result:', result)
      } catch (error) {
        console.error('[ERROR] Test ping failed:', error)
      }
    }
  }

  const handleLoadDirectory = async () => {
    console.log('🚀 [FRONTEND] ===== LOAD DIRECTORY BUTTON CLICKED =====')
    console.log('handleLoadDirectory called', { isElectron, hasShowDirectoryPicker: 'showDirectoryPicker' in window })
    
    // Primero verificar si hay información persistida para restaurar
    const savedWorkingDirectory = localStorage.getItem('fileTree_workingDirectory')
    const savedBasePath = localStorage.getItem('fileTree_basePath')
    const savedDirectoryStructure = localStorage.getItem('fileTree_directoryStructure')
    
    if (savedWorkingDirectory && savedBasePath && savedDirectoryStructure) {
      console.log('[DEBUG] Restaurando directorio persistido:', savedWorkingDirectory)
      try {
        const structure = JSON.parse(savedDirectoryStructure)
        setWorkingDirectory(savedWorkingDirectory)
        setBasePath(savedBasePath)
        setDirectoryStructure(structure)
        
        // Notificar al componente padre sobre el cambio de directorio de trabajo
        if (onWorkspacePathChange) {
          onWorkspacePathChange(savedBasePath)
        }
        
        console.log('[DEBUG] Directorio restaurado exitosamente con', structure.length, 'elementos')
        return // Salir temprano si se restauró exitosamente
      } catch (error) {
        console.error('[DEBUG] Error al restaurar directorio persistido:', error)
        // Continuar con la selección normal si hay error
      }
    }
    
    // Test communication first
    await testElectronCommunication()
    
    try {
      // Use Electron API if available
      if (isElectron && (window as any).electronAPI) {
        console.log('Using Electron API for directory selection')
        setIsLoading(true)
        setError("")
        
        try {
          console.log('🔍 [FRONTEND] Calling electronAPI.openDirectory...')
          const result = await (window as any).electronAPI.openDirectory()
          console.log('📦 [FRONTEND] Result received:', result)
          console.log('🔧 [FRONTEND] Result type:', typeof result)
          if (result) {
            console.log('🗂️ [FRONTEND] Result keys:', Object.keys(result))
            console.log('📁 [FRONTEND] Path:', result.path)
            console.log('📊 [FRONTEND] Structure length:', result.structure?.length)
          }
          
          if (result && result.structure) {
            console.log('✅ [FRONTEND] Structure received:', result.structure.length, 'items')
            console.log('📋 [FRONTEND] First few items:', result.structure.slice(0, 3))
            const directoryName = result.path.split('/').pop() || result.path.split('\\').pop() || 'Project'
            console.log('📂 [FRONTEND] Setting working directory to:', result.path)
            console.log('📁 [FRONTEND] Setting base path to:', result.path)
            setWorkingDirectory(result.path)
            setBasePath(result.path)
            // Notificar al componente padre sobre el cambio de directorio de trabajo
            if (onWorkspacePathChange) {
              onWorkspacePathChange(result.path)
            }
            console.log('🔄 [FRONTEND] Setting directory structure...')
            setDirectoryStructure(result.structure)
            setError("")
            console.log('✅ [FRONTEND] Directory structure set successfully')
            console.log('📊 [FRONTEND] Current directoryStructure state length:', directoryStructure.length)
          } else {
            console.log('[DEBUG] No result or structure from Electron API')
            console.log('[DEBUG] Result was:', result)
            setError("No se pudo cargar la estructura del directorio")
          }
        } catch (error) {
          console.error('[ERROR] Error calling Electron API:', error)
          setError(`Error al cargar directorio: ${error}`)
        }
        setIsLoading(false)
      }
      // Use File System Access API for modern browsers
      else if ('showDirectoryPicker' in window && !isElectron) {
        console.log('Using File System Access API')
        const directoryHandle = await (window as any).showDirectoryPicker()
        setIsLoading(true)
        setError("")
        
        // Save root directory handle and recursively read the directory structure
        setRootDirectoryHandle(directoryHandle)
        setBasePath(directoryHandle.name) // Set base path for absolute path construction
        // Notificar al componente padre sobre el cambio de directorio de trabajo
        if (onWorkspacePathChange) {
          onWorkspacePathChange(directoryHandle.name)
        }
        const structure = await readDirectoryRecursively(directoryHandle, "", 0, directoryHandle.name)
        setDirectoryStructure(structure)
        setWorkingDirectory(directoryHandle.name)
        setIsLoading(false)
      } else {
        console.log('Using fallback file input method')
        // Fallback para navegadores que no soportan File System Access API o Electron
        const input = document.createElement("input")
        input.type = "file"
        input.webkitdirectory = true
        input.onchange = async (e) => {
          const files = (e.target as HTMLInputElement).files
          if (files && files.length > 0) {
            setIsLoading(true)
            const firstFile = files[0]
            const pathParts = firstFile.webkitRelativePath.split('/')
            const rootDir = pathParts[0]
            setWorkingDirectory(rootDir)
            setBasePath(rootDir)
            // Notificar al componente padre sobre el cambio de directorio de trabajo
            if (onWorkspacePathChange) {
              onWorkspacePathChange(rootDir)
            }
            
            // Procesar archivos y crear estructura recursiva optimizada
            const structure = processFileListRecursively(files, rootDir)
            setDirectoryStructure(structure)
            setError("")
            setIsLoading(false)
          }
        }
        input.click()
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(`Error al cargar directorio: ${(err as Error).message}`)
      }
      setIsLoading(false)
    }
  }

  // Optimized file list processing with chunking
  const processFileListRecursively = useCallback((fileList: FileList, rootBasePath?: string): DirectoryEntry[] => {
    const structure: DirectoryEntry[] = []
    const pathMap = new Map<string, DirectoryEntry>()
    const files = Array.from(fileList)

    // Filter out unwanted files early
    const filteredFiles = files.filter(file => {
      const path = file.webkitRelativePath
      return !path.includes('node_modules') && 
             !path.includes('/.') && 
             !path.includes('/dist/') &&
             !path.includes('/build/') &&
             !path.includes('/.next/')
    })

    // Process files in chunks to avoid blocking UI
    const processChunk = (startIndex: number) => {
      const endIndex = Math.min(startIndex + CHUNK_SIZE, filteredFiles.length)
      
      for (let i = startIndex; i < endIndex; i++) {
        const file = filteredFiles[i]
        const pathParts = file.webkitRelativePath.split('/')
        let currentRelativePath = ""
        
        pathParts.forEach((part, index) => {
           const parentRelativePath = currentRelativePath
           currentRelativePath = currentRelativePath ? `${currentRelativePath}/${part}` : part
           
           // Generate absolute path by combining base path with relative path
           const absolutePath = rootBasePath ? `${rootBasePath}/${currentRelativePath}` : currentRelativePath
          
          if (!pathMap.has(absolutePath)) {
            const entry: DirectoryEntry = {
              name: part,
              type: index === pathParts.length - 1 ? "file" : "directory",
              path: absolutePath, // Store absolute path
              children: index === pathParts.length - 1 ? undefined : [],
              isExpanded: false,
              isLoaded: true,
              size: index === pathParts.length - 1 ? file.size : undefined
            }
            
            pathMap.set(absolutePath, entry)
            
            if (parentRelativePath) {
              const parentAbsolutePath = rootBasePath ? `${rootBasePath}/${parentRelativePath}` : parentRelativePath
              const parent = pathMap.get(parentAbsolutePath)
              if (parent && parent.children) {
                parent.children.push(entry)
              }
            } else {
              structure.push(entry)
            }
          }
        })
      }
    }

    // Process all chunks
    for (let i = 0; i < filteredFiles.length; i += CHUNK_SIZE) {
      processChunk(i)
    }

    // Sort the structure recursively
    const sortStructure = (entries: DirectoryEntry[]): DirectoryEntry[] => {
      return entries.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      }).map(entry => {
        if (entry.children) {
          entry.children = sortStructure(entry.children)
        }
        return entry
      })
    }

    return sortStructure(structure)
  }, [])

  // Memoized visible entries for virtual scrolling
  const visibleEntries = useMemo(() => {
    const flattenEntries = (entries: DirectoryEntry[], level: number = 0): Array<{entry: DirectoryEntry, level: number}> => {
      const result: Array<{entry: DirectoryEntry, level: number}> = []
      
      for (const entry of entries) {
        result.push({ entry, level })
        
        if (entry.type === 'directory' && 
            expandedFolders.has(entry.path) && 
            entry.children && 
            entry.isLoaded) {
          result.push(...flattenEntries(entry.children, level + 1))
        }
        
        // Limit visible items for performance
        if (result.length >= MAX_VISIBLE_ITEMS) {
          break
        }
      }
      
      return result
    }
    
    return flattenEntries(directoryStructure)
  }, [directoryStructure, expandedFolders, structureVersion])

  const renderDirectoryEntry = useCallback((entryData: {entry: DirectoryEntry, level: number}) => {
    const { entry, level } = entryData
    const isExpanded = expandedFolders.has(entry.path)
    const isLoading = loadingPaths.has(entry.path)
    const paddingLeft = level * 16 + 8
    const isDraggedOver = dragOverTarget === entry.path
    const isBeingDragged = draggedItem?.path === entry.path

    if (entry.type === "directory") {
      return (
        <div
          key={entry.path}
          className={`flex items-center gap-1 px-2 py-0.5 hover:bg-[#2a2d2e] cursor-pointer text-xs text-gray-300 ${
            isDraggedOver ? 'bg-blue-600/30 border-l-2 border-blue-500' : ''
          } ${isBeingDragged ? 'opacity-50' : ''}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          draggable
          onClick={() => toggleFolder(entry.path)}
          onContextMenu={(e) => handleContextMenu(e, entry.path, 'directory')}
          onDragStart={(e) => handleDragStart(e, entry)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, entry.path, entry.type)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, entry.path, entry.type)}
        >
          {isLoading ? (
            <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
          ) : isExpanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <Folder size={12} />
          <span>{entry.name}</span>
          {!entry.isLoaded && <span className="text-gray-500 text-xs ml-1">...</span>}
        </div>
      )
    } else {
      const isLargeFile = entry.size && entry.size > 1024 * 1024 // 1MB
      return (
        <div
          key={entry.path}
          className={`flex items-center gap-1 px-2 py-0.5 hover:bg-[#2a2d2e] cursor-pointer text-xs ${
            activeFile === entry.path ? "bg-[#094771] text-white" : "text-gray-300"
          } ${isBeingDragged ? 'opacity-50' : ''} ${isDraggedOver ? 'bg-blue-600/30 border-l-2 border-blue-500' : ''}`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          draggable
          onClick={() => handleFileSelectOptimized(entry.path)}
          onContextMenu={(e) => handleContextMenu(e, entry.path, 'file')}
          onDragStart={(e) => handleDragStart(e, entry)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, entry.path, entry.type)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, entry.path, entry.type)}
        >
          <File size={12} />
          <span className={isLargeFile ? "text-orange-400" : ""}>{entry.name}</span>
          {isLargeFile && <span className="text-xs text-orange-400 ml-1">({Math.round((entry.size || 0) / 1024)}KB)</span>}
        </div>
      )
    }
  }, [activeFile, expandedFolders, loadingPaths, toggleFolder, handleContextMenu, handleFileSelectOptimized, dragOverTarget, draggedItem, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop])

  const handleSettingChange = (setting: keyof typeof currentSettings) => {
    if (onSettingsChange) {
      onSettingsChange({
        ...currentSettings,
        [setting]: !currentSettings[setting]
      })
    }
  }

  const clearWorkingDirectory = () => {
    // Solo limpiar la vista, pero conservar la información en localStorage
    setDirectoryStructure([])
    setExpandedFolders(new Set())
    setLoadingPaths(new Set())
    setFileHandleCache(new Map())
    setRootDirectoryHandle(null)
    setError("")
    
    // Mantener workingDirectory y basePath para poder restaurar
    // No limpiar localStorage aquí para conservar el directorio
    console.log('[DEBUG] File-tree minimizado, directorio conservado en localStorage')
  }
  
  // Nueva función para restaurar el directorio de trabajo desde localStorage
  const restoreWorkingDirectory = useCallback(async () => {
    const savedWorkingDirectory = localStorage.getItem('fileTree_workingDirectory')
    const savedBasePath = localStorage.getItem('fileTree_basePath')
    const savedExpandedFolders = localStorage.getItem('fileTree_expandedFolders')
    const savedDirectoryStructure = localStorage.getItem('fileTree_directoryStructure')
    
    if (savedWorkingDirectory && savedBasePath) {
      console.log('[DEBUG] Restaurando directorio de trabajo:', savedWorkingDirectory)
      
      // Validar que el directorio existe si estamos en Electron
      if (isElectron && (window as any).electronAPI) {
        try {
          const dirStats = await (window as any).electronAPI.getFileStats(savedWorkingDirectory)
          if (!dirStats || !dirStats.success || !dirStats.stats || !dirStats.stats.isDirectory()) {
            console.warn('[DEBUG] El directorio guardado no existe:', savedWorkingDirectory)
            completelyCloseDirectory()
            return false
          }
        } catch (error) {
          console.warn('[DEBUG] Error al validar directorio guardado:', error)
          completelyCloseDirectory()
          return false
        }
      }
      
      setWorkingDirectory(savedWorkingDirectory)
      setBasePath(savedBasePath)
      
      // Restaurar directorios expandidos
      if (savedExpandedFolders) {
        try {
          const expandedArray = JSON.parse(savedExpandedFolders)
          setExpandedFolders(new Set(expandedArray))
          console.log('[DEBUG] Directorios expandidos restaurados:', expandedArray.length)
        } catch (error) {
          console.error('[DEBUG] Error al restaurar directorios expandidos:', error)
        }
      }
      
      // Restaurar estructura de directorios
      if (savedDirectoryStructure) {
        try {
          const structure = JSON.parse(savedDirectoryStructure)
          setDirectoryStructure(structure)
          console.log('[DEBUG] Estructura de directorios restaurada:', structure.length, 'elementos')
          
          // Notificar al componente padre sobre el cambio de directorio de trabajo
          if (onWorkspacePathChange) {
            onWorkspacePathChange(savedBasePath)
          }
          
          return true
        } catch (error) {
          console.error('[DEBUG] Error al restaurar estructura de directorios:', error)
        }
      }
    }
    
    return false
  }, [isElectron, onWorkspacePathChange])

  // Nueva función para limpiar completamente (si se necesita)
  const completelyCloseDirectory = () => {
    setWorkingDirectory("")
    setBasePath("")
    setDirectoryStructure([])
    setExpandedFolders(new Set())
    setLoadingPaths(new Set())
    setFileHandleCache(new Map())
    setRootDirectoryHandle(null)
    setError("")
    
    // Limpiar localStorage completamente
    localStorage.removeItem('fileTree_workingDirectory')
    localStorage.removeItem('fileTree_basePath')
    localStorage.removeItem('fileTree_expandedFolders')
    localStorage.removeItem('fileTree_directoryStructure')
    console.log('[DEBUG] Directorio de trabajo completamente cerrado y localStorage limpiado')
    
    // Notificar al componente padre que se cerró el directorio
    if (onWorkspacePathChange) {
      onWorkspacePathChange("")
    }
  }

  useEffect(() => {
    if (workingDirectory) {
      loadDirectoryStructure()
    }
  }, [workingDirectory, loadDirectoryStructure])



  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] border-r border-[#3e3e3e]">
      {/* Tab Headers */}
      <div className="flex border-b border-[#3e3e3e]">
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            activeTab === "explorer"
              ? "bg-[#2d2d30] text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
          }`}
          onClick={() => setActiveTab("explorer")}
        >
          Explorer
        </button>
        <button
          className={`flex-1 px-3 py-2 text-xs font-medium ${
            activeTab === "settings"
              ? "bg-[#2d2d30] text-white border-b-2 border-blue-500"
              : "text-gray-400 hover:text-white hover:bg-[#2a2d2e]"
          }`}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={12} className="inline mr-1" />
          Settings
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "explorer" && (
          <div className="h-full flex flex-col">
            {/* Directory Controls */}
            <div className="p-2 border-b border-[#3e3e3e]">
              {!workingDirectory ? (
                <div className="space-y-2">
                  <button
                    onClick={handleLoadDirectory}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-gray-600 text-white text-xs rounded transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      <>
                        <FolderOpen size={12} />
                        Cargar Directorio
                      </>
                    )}
                  </button>
                  {hasPersistedData && (
                    <button
                      onClick={restoreWorkingDirectory}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#2a2d2e] hover:bg-[#3e3e3e] border border-[#4a4a4a] text-gray-300 text-xs rounded transition-colors"
                      title="Restaurar directorio anterior"
                    >
                      <RotateCcw size={12} />
                      Restaurar Directorio
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300 truncate flex-1">{workingDirectory}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={refreshDirectoryStructure}
                        className="p-1 hover:bg-[#2a2d2e] rounded"
                        title="Refrescar directorio"
                      >
                        <RefreshCw size={12} className="text-gray-400 hover:text-white" />
                      </button>
                      <button
                        onClick={completelyCloseDirectory}
                        className="p-1 hover:bg-[#2a2d2e] rounded"
                        title="Cerrar directorio completamente"
                      >
                        <X size={12} className="text-gray-400" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startCreateFile()}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-[#2a2d2e] hover:bg-[#3e3e3e] text-gray-300 text-xs rounded transition-colors"
                      title="Crear nuevo archivo"
                    >
                      <FilePlus size={12} />
                      Archivo
                    </button>
                    <button
                      onClick={() => startCreateFolder()}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-[#2a2d2e] hover:bg-[#3e3e3e] text-gray-300 text-xs rounded transition-colors"
                      title="Crear nueva carpeta"
                    >
                      <FolderPlus size={12} />
                      Carpeta
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Search Interface */}
            {workingDirectory && (
              <div className="p-2 border-b border-[#3e3e3e]">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar archivos... (↑↓ para navegar, Enter para abrir, Esc para limpiar)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-7 pr-8 py-1.5 bg-[#2a2d2e] border border-[#3e3e3e] rounded text-xs text-gray-300 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {isSearching && (
                      <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                </div>
                
                {/* Advanced Filters Toggle Button */}
                <div className="mt-2 flex justify-between items-center">
                  <div className="text-xs text-gray-500">
                    {searchResults.length > 0 && searchQuery && (
                      <span>
                        {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} encontrado{searchResults.length !== 1 ? 's' : ''}
                        {selectedSearchResult >= 0 && ` (${selectedSearchResult + 1}/${searchResults.length})`}
                      </span>
                    )}
                    {searchQuery && !isElectron && (
                      <span className="ml-2 text-blue-400">(búsqueda local)</span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      showAdvancedSearch 
                        ? "bg-blue-600 text-white" 
                        : "bg-[#2a2d2e] text-gray-400 hover:bg-[#3e3e3e] hover:text-white"
                    }`}
                    title="Filtros avanzados de búsqueda"
                  >
                    <Settings size={12} />
                    <span>Filtros</span>
                    <ChevronDown 
                      size={10} 
                      className={`transition-transform ${showAdvancedSearch ? 'rotate-180' : ''}`} 
                    />
                  </button>
                </div>

                {/* Advanced Search Filters */}
                {showAdvancedSearch && (
                  <div className="mt-2 p-2 bg-[#1e1e1e] border border-[#3e3e3e] rounded text-xs">
                    <div className="space-y-2">
                      <div>
                        <label className="block text-gray-400 mb-1">Tipos de archivo:</label>
                        <input
                          type="text"
                          placeholder=".js,.ts,.tsx,.css (separados por comas)"
                          value={searchFilters.fileTypes.join(',')}
                          onChange={(e) => setSearchFilters(prev => ({
                            ...prev,
                            fileTypes: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                          }))}
                          className="w-full px-2 py-1 bg-[#2a2d2e] border border-[#3e3e3e] rounded text-xs text-gray-300"
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={searchFilters.includeDirectories}
                            onChange={(e) => setSearchFilters(prev => ({
                              ...prev,
                              includeDirectories: e.target.checked
                            }))}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-400">Incluir carpetas</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={searchFilters.caseSensitive}
                            onChange={(e) => setSearchFilters(prev => ({
                              ...prev,
                              caseSensitive: e.target.checked
                            }))}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-400">Sensible a mayúsculas</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={searchFilters.useRegex}
                            onChange={(e) => setSearchFilters(prev => ({
                              ...prev,
                              useRegex: e.target.checked
                            }))}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-400">Usar RegEx</span>
                        </label>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={searchFilters.searchInContent}
                            onChange={(e) => setSearchFilters(prev => ({
                              ...prev,
                              searchInContent: e.target.checked
                            }))}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-400">Buscar en contenido</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">Máx resultados:</span>
                        <input
                          type="number"
                          min="10"
                          max="500"
                          value={searchFilters.maxResults}
                          onChange={(e) => setSearchFilters(prev => ({
                            ...prev,
                            maxResults: parseInt(e.target.value) || 100
                          }))}
                          className="w-16 px-1 py-0.5 bg-[#2a2d2e] border border-[#3e3e3e] rounded text-xs text-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                )}


              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="p-2 bg-red-900/20 border-b border-red-500/30">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* New File Input */}
            {isCreatingFile && (
              <div className="p-2 border-b border-[#3e3e3e]">
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="nombre-archivo.ext"
                  className="w-full px-2 py-1 bg-[#3c3c3c] border border-[#5e5e5e] rounded text-xs text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={handleCreateFile}
                    className="px-2 py-1 bg-[#0e639c] hover:bg-[#1177bb] text-white text-xs rounded"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingFile(false)
                      setNewFileName("")
                    }}
                    className="px-2 py-1 bg-[#2a2d2e] hover:bg-[#3e3e3e] text-gray-300 text-xs rounded"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* New Folder Input */}
            {isCreatingFolder && (
              <div className="p-2 border-b border-[#3e3e3e]">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="nombre-carpeta"
                  className="w-full px-2 py-1 bg-[#3c3c3c] border border-[#5e5e5e] rounded text-xs text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={handleCreateFolder}
                    className="px-2 py-1 bg-[#0e639c] hover:bg-[#1177bb] text-white text-xs rounded"
                  >
                    Crear
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingFolder(false)
                      setNewFolderName("")
                    }}
                    className="px-2 py-1 bg-[#2a2d2e] hover:bg-[#3e3e3e] text-gray-300 text-xs rounded"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* File Tree with Virtual Scrolling */}
            <div 
              className="flex-1 overflow-auto pb-4"
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Solo permitir drop si hay un elemento siendo arrastrado
                if (draggedItem) {
                  e.dataTransfer.dropEffect = 'move'
                }
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                // Drop al directorio raíz
                if (draggedItem && workingDirectory) {
                  handleDrop(e, workingDirectory, 'directory')
                }
              }}
            >
              {isLoading && directoryStructure.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="flex items-center gap-2 text-gray-400 text-xs">
                    <div className="w-4 h-4 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    Cargando estructura...
                  </div>
                </div>
              ) : searchQuery && searchResults.length > 0 ? (
                // Mostrar resultados de búsqueda
                <div className="py-1">
                  {searchResults.map((entry, index) => (
                    <div key={`search-${entry.path}-${index}`}>
                      <div
                        className={`flex items-center gap-1 px-2 py-0.5 hover:bg-[#2a2d2e] cursor-pointer text-xs ${
                          activeFile === entry.path 
                            ? "bg-[#094771] text-white" 
                            : selectedSearchResult === index 
                              ? "bg-[#3e3e3e] text-white border-l-2 border-blue-500" 
                              : "text-gray-300"
                        }`}
                        onClick={() => handleFileSelectOptimized(entry.path)}
                      >
                        {entry.type === "file" ? <File size={12} /> : <Folder size={12} />}
                        <span>{entry.name}</span>
                        <span className="text-xs text-gray-500 ml-auto">{entry.path.replace(workingDirectory, "")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchQuery && searchResults.length === 0 && !isSearching ? (
                // No hay resultados de búsqueda
                <div className="flex items-center justify-center h-32">
                  <div className="text-gray-400 text-xs text-center">
                    <Search size={16} className="mx-auto mb-2 opacity-50" />
                    No se encontraron archivos que coincidan con "{searchQuery}"
                  </div>
                </div>
              ) : directoryStructure.length > 0 ? (
                <div className="py-2">
                  {visibleEntries.map((entryData, index) => (
                    <div key={`${entryData.entry.path}-${index}`}>
                      {renderDirectoryEntry(entryData)}
                    </div>
                  ))}
                  {visibleEntries.length >= MAX_VISIBLE_ITEMS && (
                    <div className="p-2 text-xs text-gray-500 text-center">
                      Mostrando {MAX_VISIBLE_ITEMS} elementos. Expande carpetas para ver más.
                    </div>
                  )}
                </div>
              ) : workingDirectory ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-xs">Directorio vacío</p>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32">
                  <p className="text-gray-400 text-xs">Selecciona un directorio para comenzar</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white mb-3">Editor</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={currentSettings.lineNumbers}
                    onChange={() => handleSettingChange('lineNumbers')}
                    className="rounded"
                  />
                  Números de línea
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={currentSettings.syntaxHighlighting}
                    onChange={() => handleSettingChange('syntaxHighlighting')}
                    className="rounded"
                  />
                  Resaltado de sintaxis
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={currentSettings.wordWrap}
                    onChange={() => handleSettingChange('wordWrap')}
                    className="rounded"
                  />
                  Ajuste de línea
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-white mb-3">AI Assistant</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={currentSettings.autoResponses}
                    onChange={() => handleSettingChange('autoResponses')}
                    className="rounded"
                  />
                  Respuestas automáticas
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={currentSettings.codeSuggestions}
                    onChange={() => handleSettingChange('codeSuggestions')}
                    className="rounded"
                  />
                  Sugerencias de código
                </label>
                
                <div className="space-y-1">
                  <label className="text-xs text-gray-300">Archivo de chat:</label>
                  <input
                    type="text"
                    value={currentSettings.chatFileName}
                    onChange={(e) => {
                      if (onSettingsChange) {
                        onSettingsChange({
                          ...currentSettings,
                          chatFileName: e.target.value
                        })
                      }
                    }}
                    className="w-full px-2 py-1 bg-[#3c3c3c] border border-[#5e5e5e] rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    placeholder="chat.md"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-300">Proveedor de AI: OpenRouter</label>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-300">API Key:</label>
                  <input
                    type="password"
                    value={currentAiProvider.apiKey || ''}
                    onChange={(e) => {
                      handleAiProviderChange({
                        ...currentAiProvider,
                        apiKey: e.target.value
                      })
                    }}
                    className="w-full px-2 py-1 bg-[#3c3c3c] border border-[#5e5e5e] rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    placeholder="sk-or-..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-300">Modelo:</label>
                  <input
                    type="text"
                    value={currentAiProvider.model || ''}
                    onChange={(e) => {
                      handleAiProviderChange({
                        ...currentAiProvider,
                        model: e.target.value
                      })
                    }}
                    className="w-full px-2 py-1 bg-[#3c3c3c] border border-[#5e5e5e] rounded text-xs text-white focus:outline-none focus:border-blue-500"
                    placeholder="anthropic/claude-3.5-sonnet"
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={async () => {
                      if (!currentAiProvider.apiKey) {
                        alert('Por favor, ingresa tu API key de OpenRouter primero.');
                        return;
                      }
                      
                      try {
                        const testProvider = { ...currentAiProvider };
                        const { aiService } = await import('../lib/ai-service');
                        aiService.setProvider(testProvider);
                        
                        const isHealthy = await aiService.healthCheck();
                        if (isHealthy) {
                          alert('✅ Conexión exitosa con OpenRouter!');
                        } else {
                          alert('❌ Error de conexión. Verifica tu API key y conexión a internet.');
                        }
                      } catch (error) {
                        console.error('Test connection error:', error);
                        alert(`❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
                      }
                    }}
                    className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors"
                  >
                    Probar Conexión
                  </button>
                </div>

                {/* Botón Guardar Configuración */}
                <div className="pt-3 border-t border-[#5e5e5e]">
                  <button
                    onClick={() => {
                      // Guardar configuración en localStorage
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('aiProvider', JSON.stringify(currentAiProvider))
                        localStorage.setItem('editorSettings', JSON.stringify(currentSettings))
                        
                        // Mostrar mensaje de confirmación temporal
                        const button = document.activeElement as HTMLButtonElement
                        const originalText = button.textContent
                        button.textContent = '✓ Guardado'
                        button.style.backgroundColor = '#10b981'
                        
                        setTimeout(() => {
                          button.textContent = originalText
                          button.style.backgroundColor = ''
                        }, 2000)
                      }
                    }}
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded transition-colors duration-200"
                  >
                    Guardar Configuración
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-[#2a2d2e] border border-[#5e5e5e] rounded shadow-lg z-50 py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              startCreateFile(contextMenu.targetPath)
              closeContextMenu()
            }}
            className="w-full px-3 py-1 text-left text-xs text-gray-300 hover:bg-[#3e3e3e] flex items-center gap-2"
          >
            <FilePlus size={12} />
            Nuevo Archivo
          </button>
          <button
            onClick={() => {
              startCreateFolder(contextMenu.targetPath)
              closeContextMenu()
            }}
            className="w-full px-3 py-1 text-left text-xs text-gray-300 hover:bg-[#3e3e3e] flex items-center gap-2"
          >
            <FolderPlus size={12} />
            Nueva Carpeta
          </button>
        </div>
      )}
    </div>
  )
}
