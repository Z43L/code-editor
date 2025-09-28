"use client"

import React, { useState, useRef, useCallback, useEffect } from "react"
import { FileTree } from "./file-tree"
import { EditorContent } from "./editor-content"
import { AICommandBar } from "./ai-command-bar"
import { useElectron } from "../hooks/use-electron"
import { chatService } from "../lib/chat-service"
import type { AIProvider, FileContextSnapshot } from "../lib/ai-service"

export interface FileItem {
  name: string
  type: "file" | "folder"
  content?: string
  children?: FileItem[]
  isOpen?: boolean
  path: string
  summary?: string
  hash?: string
  preview?: string
  metadata?: FileContextSnapshot
}

const SUMMARY_LINE_LIMIT = 12
const SUMMARY_CHAR_LIMIT = 600

const summarizeContent = (content: string): string => {
  const normalized = content.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    return ""
  }
  const lines = normalized.split("\n").slice(0, SUMMARY_LINE_LIMIT)
  const joined = lines.join("\n")
  if (joined.length <= SUMMARY_CHAR_LIMIT) {
    return joined
  }
  return `${joined.slice(0, SUMMARY_CHAR_LIMIT)}…`
}

const computeContentSignature = (content: string): string => {
  let hash = 0
  for (let i = 0; i < content.length; i += 1) {
    hash = (hash * 31 + content.charCodeAt(i)) >>> 0
  }
  const lengthHex = content.length.toString(16)
  const hashHex = hash.toString(16)
  return `${lengthHex}-${hashHex}`
}

const createSnapshotFromContent = (filePath: string, content: string): FileContextSnapshot => {
  const name = filePath.split("/").pop() || filePath
  const summary = summarizeContent(content)
  const hash = computeContentSignature(content)
  const extension = filePath.includes(".") ? `.${filePath.split(".").pop()?.toLowerCase()}` : undefined
  return {
    path: filePath,
    name,
    summary,
    preview: summary,
    hash,
    size: content.length,
    modified: Date.now(),
    extension,
  }
}

const DEFAULT_README_CONTENT = `# En busca de un nuevo proyecto....

## en un lugar uy legano de la galaxya....

este es un proyecto simple de un editor de codigo
pero por muy simple que parezca ahi es donde 
reside su fuerza

que la fuerza te acompañe
          **Anaquin Skywaler**.
`

export function FlutterEditor() {
  const [activeFile, setActiveFile] = useState<string>("README.md")
  const [editorSettings, setEditorSettings] = useState({
    lineNumbers: true,
    syntaxHighlighting: true,
    wordWrap: false,
    autoResponses: true,
    codeSuggestions: true,
    chatFileName: "chat.md",
  })
  const [aiProvider, setAiProvider] = useState<AIProvider>({
    type: 'openrouter',
    apiKey: '',
    model: 'anthropic/claude-3.5-sonnet'
  })
  const [sidebarWidth, setSidebarWidth] = useState(256)
  const [isResizing, setIsResizing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workspacePath, setWorkspacePath] = useState<string>("")
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Detectar si estamos en Electron de manera segura para SSR
  const { isElectron, isHydrated } = useElectron()

  // Cargar configuración guardada desde localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedAiProvider = localStorage.getItem('aiProvider')
        if (savedAiProvider) {
          const parsedProvider = JSON.parse(savedAiProvider)
          setAiProvider(parsedProvider)
        }

        const savedEditorSettings = localStorage.getItem('editorSettings')
        if (savedEditorSettings) {
          const parsedSettings = JSON.parse(savedEditorSettings)
          setEditorSettings(parsedSettings)
        }
      } catch (error) {
        console.error('Error loading saved configuration:', error)
      }
    }
  }, [])

  // Configurar el servicio de chat cuando cambie el directorio de trabajo
  useEffect(() => {
    if (workspacePath) {
      chatService.setWorkspacePath(workspacePath)
      chatService.setChatNameConfig(editorSettings.chatFileName.replace('.md', ''))
      console.log('Chat service configured for workspace:', workspacePath)
    }
  }, [workspacePath, editorSettings.chatFileName])
  const [files, setFiles] = useState<Record<string, FileItem>>(() => {
    const snapshot = createSnapshotFromContent("README.md", DEFAULT_README_CONTENT)
    return {
      "README.md": {
        name: "README.md",
        type: "file",
        path: "README.md",
        content: DEFAULT_README_CONTENT,
        summary: snapshot.summary,
        hash: snapshot.hash,
        preview: snapshot.preview,
        metadata: snapshot,
      },
    }
  })

  const [fileContextIndex, setFileContextIndex] = useState<Record<string, FileContextSnapshot>>(() => {
    const snapshot = createSnapshotFromContent("README.md", DEFAULT_README_CONTENT)
    return { "README.md": snapshot }
  })

  const updateFileContent = useCallback((filePath: string, content: string) => {
    const snapshot = createSnapshotFromContent(filePath, content)
    setFiles((prev) => ({
      ...prev,
      [filePath]: {
        ...prev[filePath],
        name: prev[filePath]?.name || filePath.split("/").pop() || filePath,
        type: "file",
        path: filePath,
        content,
        summary: snapshot.summary,
        hash: snapshot.hash,
        preview: snapshot.preview,
        metadata: snapshot,
      },
    }))
    setFileContextIndex((prev) => ({
      ...prev,
      [filePath]: {
        ...(prev[filePath] || {}),
        ...snapshot,
      },
    }))
  }, [])

  // Function to handle loading real file content from file tree
  const handleLoadRealFileContent = useCallback((filePath: string, content: string) => {
    const snapshot = createSnapshotFromContent(filePath, content)
    setFiles((prev) => ({
      ...prev,
      [filePath]: {
        name: filePath.split("/").pop() || filePath,
        type: "file",
        path: filePath,
        content,
        summary: snapshot.summary,
        hash: snapshot.hash,
        preview: snapshot.preview,
        metadata: snapshot,
      },
    }))
    setFileContextIndex((prev) => ({
      ...prev,
      [filePath]: {
        ...(prev[filePath] || {}),
        ...snapshot,
      },
    }))
  }, [])

  const createFile = useCallback((filePath: string, content = "") => {
    const fileName = filePath.split("/").pop() || filePath
    const snapshot = createSnapshotFromContent(filePath, content)
    setFiles((prev) => ({
      ...prev,
      [filePath]: {
        name: fileName,
        type: "file",
        path: filePath,
        content,
        summary: snapshot.summary,
        hash: snapshot.hash,
        preview: snapshot.preview,
        metadata: snapshot,
      },
    }))
    setFileContextIndex((prev) => ({
      ...prev,
      [filePath]: {
        ...(prev[filePath] || {}),
        ...snapshot,
      },
    }))
  }, [])

  const mergeContextIndex = useCallback((incoming: Record<string, FileContextSnapshot>) => {
    if (!incoming) {
      return
    }
    setFileContextIndex((prev) => {
      const next = { ...prev }
      Object.entries(incoming).forEach(([path, snapshot]) => {
        const fallbackName = snapshot.name || path.split("/").pop() || path
        next[path] = {
          ...(prev[path] || {}),
          ...snapshot,
          path: snapshot.path || path,
          name: fallbackName,
        }
      })
      return next
    })
    setFiles((prev) => {
      let mutated = false
      const next = { ...prev }
      Object.entries(incoming).forEach(([path, snapshot]) => {
        if (!next[path]) {
          return
        }
        const currentItem = next[path]
        const updatedMetadata = {
          ...(currentItem.metadata || {}),
          ...snapshot,
          path: snapshot.path || path,
          name: snapshot.name || currentItem.name || path.split("/").pop() || path,
        }
        const summary = snapshot.summary || currentItem.summary
        const hash = snapshot.hash || currentItem.hash
        const preview = snapshot.preview || currentItem.preview
        if (
          currentItem.metadata !== updatedMetadata ||
          currentItem.summary !== summary ||
          currentItem.hash !== hash ||
          currentItem.preview !== preview
        ) {
          next[path] = {
            ...currentItem,
            name: updatedMetadata.name,
            summary,
            hash,
            preview,
            metadata: updatedMetadata,
          }
          mutated = true
        }
      })
      return mutated ? next : prev
    })
  }, [])

  // Function to load real file content from file system
  const loadFileContent = async (filePath: string): Promise<string> => {
    try {
      // Use Electron API if available
      if (isElectron && (window as any).electronAPI) {
        const result = await (window as any).electronAPI.openFile();
        if (result && result.content) {
          return result.content;
        }
        return '';
      }
      // Use File System Access API for modern browsers
      else if ('showOpenFilePicker' in window && !isElectron) {
        // Use File System Access API to open and read the file
        const [fileHandle] = await (window as any).showOpenFilePicker({
          types: [
            {
              description: 'Text files',
              accept: {
                'text/*': ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.xml', '.yaml', '.yml'],
              },
            },
            {
              description: 'All files',
              accept: {
                '*/*': ['.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.c', '.cpp', '.h', '.hpp'],
              },
            },
          ],
        })
        
        const file = await fileHandle.getFile()
        const content = await file.text()
        return content
      } else {
        // Fallback for browsers without File System Access API or Electron
        return new Promise((resolve) => {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = '.txt,.md,.js,.ts,.jsx,.tsx,.css,.html,.json,.xml,.yaml,.yml,.py,.java,.c,.cpp,.h,.hpp'
          input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (file) {
              const content = await file.text()
              resolve(content)
            } else {
              resolve('')
            }
          }
          input.click()
        })
      }
    } catch (error) {
      // Only log errors that are not user cancellations
      if ((error as Error).name !== 'AbortError') {
        console.error('Error loading file content:', error)
      }
      return ''
    }
  }

  const handleFileSelect = useCallback(async (filePath: string) => {
    // Always set as active file - this ensures the editor switches to the selected file
    // The FileTree component will handle loading the real content via handleLoadRealFileContent
    setActiveFile(filePath)
  }, [])

  const handleContextMetadata = useCallback((incoming: Record<string, FileContextSnapshot>) => {
    mergeContextIndex(incoming)
  }, [mergeContextIndex])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const newWidth = e.clientX
    if (newWidth >= 200 && newWidth <= 600) {
      setSidebarWidth(newWidth)
    }
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div className={`h-screen bg-[#1e1e1e] text-white flex flex-col font-mono text-sm hw-accelerated reduce-repaints interactive-layer ${isHydrated && isElectron ? 'electron-app' : ''}`}>
      {/* Tab Bar */}
      <div className="bg-[#2d2d30] flex items-center px-2 h-9">
        <div className="flex items-center gap-1">
          {Object.keys(files).map((filePath) => (
            <div
              key={filePath}
              className={`px-3 py-1 text-xs flex items-center gap-2 cursor-pointer ${
                activeFile === filePath ? "bg-[#1e1e1e]" : "bg-[#2d2d30] hover:bg-[#1e1e1e]"
              }`}
              onClick={() => setActiveFile(filePath)}
            >
              <span className="text-white">📄</span>
              <span>{files[filePath].name}</span>
              <button
                className="text-gray-400 hover:text-white ml-1"
                onClick={(e) => {
                  e.stopPropagation()
                  const newFiles = { ...files }
                  delete newFiles[filePath]
                  setFiles(newFiles)
                  if (activeFile === filePath) {
                    const remainingFiles = Object.keys(newFiles)
                    setActiveFile(remainingFiles[0] || "")
                  }
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div 
          ref={sidebarRef}
          className="bg-[#252526] flex flex-col relative transition-all duration-200"
          style={{ width: sidebarCollapsed ? 32 : sidebarWidth }}
        >
          <div className="p-2 text-xs text-gray-300 uppercase tracking-wide bg-[#2d2d30] flex items-center justify-between">
            {!sidebarCollapsed && <span>Explorer</span>}
            <button
              onClick={toggleSidebar}
              className="text-gray-400 hover:text-white text-xs"
              title={sidebarCollapsed ? "Mostrar panel lateral" : "Ocultar panel lateral"}
            >
              {sidebarCollapsed ? "→" : "←"}
            </button>
          </div>
          <div className={`flex-1 overflow-hidden ${sidebarCollapsed ? 'hidden' : 'block'}`}>
            <FileTree 
              activeFile={activeFile} 
              onFileSelect={handleFileSelect} 
              files={files} 
              onCreateFile={createFile}
              onLoadRealFileContent={handleLoadRealFileContent}
              editorSettings={editorSettings}
              onSettingsChange={setEditorSettings}
              aiProvider={aiProvider}
              onAiProviderChange={setAiProvider}
              onWorkspacePathChange={setWorkspacePath}
              onContextMetadata={handleContextMetadata}
            />
          </div>
          {/* Resize Handle - solo visible cuando no está colapsado */}
          {!sidebarCollapsed && (
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-blue-500 transition-colors pointer-events-auto"
              onMouseDown={handleMouseDown}
              title="Arrastrar para redimensionar"
              style={{ zIndex: 10 }}
            />
          )}
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col">
          <EditorContent
            file={files[activeFile]}
            onContentChange={(content) => updateFileContent(activeFile, content)}
            files={files}
            onCreateFile={createFile}
            onLoadFileContent={loadFileContent}
            editorSettings={editorSettings}
          />
        </div>
      </div>

      {/* AI Command Bar */}
      <AICommandBar 
        activeFile={activeFile} 
        files={files} 
        onUpdateFile={updateFileContent} 
        onCreateFile={createFile}
        aiProvider={aiProvider}
        chatFileName={editorSettings.chatFileName}
        onSelectFile={handleFileSelect}
        fileContextIndex={fileContextIndex}
      />
    </div>
  )
}
