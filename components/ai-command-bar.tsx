"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import type { FileItem } from "./flutter-editor"
import { aiService, type EditorChatRequest, type AIProvider, type FileContextSnapshot } from "../lib/ai-service"
import { chatService } from "../lib/chat-service"

const RELATED_FILES_LIMIT = 4
const CONTEXT_SUMMARY_LINE_LIMIT = 12
const CONTEXT_SUMMARY_CHAR_LIMIT = 600
const SELECTION_PREVIEW_LIMIT = 1500

type FileContextIndex = Record<string, FileContextSnapshot>

const summarizeForContext = (content?: string): string | undefined => {
  if (!content) {
    return undefined
  }

  const normalized = content.replace(/\r\n/g, "\n").trim()
  if (!normalized) {
    return undefined
  }

  const lines = normalized.split("\n").slice(0, CONTEXT_SUMMARY_LINE_LIMIT)
  const joined = lines.join("\n")
  if (joined.length <= CONTEXT_SUMMARY_CHAR_LIMIT) {
    return joined
  }

  return `${joined.slice(0, CONTEXT_SUMMARY_CHAR_LIMIT)}…`
}

const truncate = (text: string, limit: number): string => {
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit)}…`
}

const gatherRelatedPaths = (activeFile: string, files: Record<string, FileItem>, index: FileContextIndex): string[] => {
  const candidates: string[] = []
  const activeDirectory = activeFile.includes("/") ? activeFile.slice(0, activeFile.lastIndexOf("/")) : ""

  Object.keys(files).forEach((path) => {
    if (path !== activeFile) {
      candidates.push(path)
    }
  })

  const prioritized: string[] = []
  const seen = new Set<string>()

  if (activeDirectory) {
    candidates.forEach((path) => {
      if (!seen.has(path) && path.startsWith(activeDirectory)) {
        prioritized.push(path)
        seen.add(path)
      }
    })
  }

  candidates.forEach((path) => {
    if (!seen.has(path)) {
      prioritized.push(path)
      seen.add(path)
    }
  })

  if (prioritized.length < RELATED_FILES_LIMIT) {
    Object.keys(index).forEach((path) => {
      if (path !== activeFile && !seen.has(path)) {
        prioritized.push(path)
        seen.add(path)
      }
    })
  }

  return prioritized.slice(0, RELATED_FILES_LIMIT)
}

const sanitizeRelativeDirectory = (dir?: string): string => {
  if (!dir) {
    return "chats"
  }

  const normalized = dir
    .trim()
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/^\\+/, "")
    .replace(/\\/g, "/")

  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")

  return segments.length > 0 ? segments.join("/") : "chats"
}

interface ContextBundleParams {
  activeFile: string
  files: Record<string, FileItem>
  fileContextIndex: FileContextIndex
  selectedText: string
  hasSelection: boolean
}

const buildContextBundle = ({ activeFile, files, fileContextIndex, selectedText, hasSelection }: ContextBundleParams): {
  promptContext: string
  payload?: EditorChatRequest["context"]
} => {
  const sections: string[] = []
  const payload: EditorChatRequest["context"] = {}

  const baseMeta = fileContextIndex[activeFile]
  const activeSummary = summarizeForContext(files[activeFile]?.content) ?? baseMeta?.summary ?? baseMeta?.preview

  if (baseMeta || activeSummary) {
    const activeSnapshot: FileContextSnapshot = {
      path: baseMeta?.path || activeFile,
      name: baseMeta?.name || activeFile.split("/").pop() || activeFile,
      hash: baseMeta?.hash,
      summary: activeSummary,
      preview: baseMeta?.preview ?? activeSummary,
      size: baseMeta?.size,
      modified: baseMeta?.modified,
      extension: baseMeta?.extension,
      lineCount: baseMeta?.lineCount,
    }

    payload.activeFile = activeSnapshot

    const lines = [`Path: ${activeSnapshot.path}`]
    if (activeSnapshot.hash) {
      lines.push(`Hash: ${activeSnapshot.hash}`)
    }
    const summaryText = activeSnapshot.summary || "Summary not available."
    sections.push(`Active File\n${lines.join("\n")}\n${summaryText}`)
  }

  const relatedPaths = gatherRelatedPaths(activeFile, files, fileContextIndex)
  if (relatedPaths.length > 0) {
    const relatedSnapshots: FileContextSnapshot[] = []
    const relatedDescriptions: string[] = []

    relatedPaths.forEach((path, index) => {
      const meta = fileContextIndex[path]
      const summary = summarizeForContext(files[path]?.content) ?? meta?.summary ?? meta?.preview
      if (!meta && !summary) {
        return
      }

      const snapshot: FileContextSnapshot = {
        path: meta?.path || path,
        name: meta?.name || path.split("/").pop() || path,
        hash: meta?.hash,
        summary: summary,
        preview: meta?.preview ?? summary,
        size: meta?.size,
        modified: meta?.modified,
        extension: meta?.extension,
        lineCount: meta?.lineCount,
      }

      relatedSnapshots.push(snapshot)
      const header = `${index + 1}. ${snapshot.path}${snapshot.hash ? ` (hash: ${snapshot.hash})` : ""}`
      relatedDescriptions.push(`${header}\n${snapshot.summary || "Summary not available."}`)
    })

    if (relatedSnapshots.length > 0) {
      payload.relatedFiles = relatedSnapshots
      sections.push(`Related Files\n${relatedDescriptions.join("\n\n")}`)
    }
  }

  if (hasSelection && selectedText) {
    const selectionPreview = truncate(selectedText, SELECTION_PREVIEW_LIMIT)
    payload.selection = {
      text: selectionPreview,
      original_length: selectedText.length,
      truncated: selectionPreview.length !== selectedText.length,
      summary: summarizeForContext(selectionPreview),
    }
    sections.push(`Current Selection\n\`\`\`\n${selectionPreview}\n\`\`\``)
  }

  const promptContext = sections.join("\n\n")

  if (!promptContext) {
    return { promptContext: "" }
  }

  return {
    promptContext,
    payload,
  }
}

interface AICommandBarProps {
  activeFile: string
  files: Record<string, FileItem>
  onUpdateFile: (filePath: string, content: string) => void
  onCreateFile: (filePath: string, content: string) => void
  aiProvider?: AIProvider
  chatFileName?: string
  chatDirectory?: string
  onSelectFile?: (filePath: string) => void
  fileContextIndex: FileContextIndex
}

export function AICommandBar({ activeFile, files, onUpdateFile, onCreateFile, aiProvider, chatFileName = "chat.md", chatDirectory = "chats", onSelectFile, fileContextIndex }: AICommandBarProps) {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput("")
    setIsLoading(true)

  const chatFileNameClean = (chatFileName || "chat.md").trim() || "chat.md"
  const chatDirectoryClean = sanitizeRelativeDirectory(chatDirectory)
  const chatFilePath = `${chatDirectoryClean}/${chatFileNameClean}`
  const defaultChatContent = "# AI Chat History\n\n"

    try {
      // Check if user has selected text
      const editorActions = (window as any).editorActions
      const hasSelection = editorActions?.hasSelection || false
      const selectedText = editorActions?.selectedText || ""

      // Detect special commands
      const isFixCommand = userMessage.toLowerCase().startsWith('/fix')
      const isRefactorCommand = userMessage.toLowerCase().startsWith('/refactoriza')
      const isCommentCommand = userMessage.toLowerCase().startsWith('/comment')
      // Prepare the actual message for AI (remove command prefix)
      let aiMessage = userMessage
      if (isFixCommand) {
        aiMessage = `Fix the following code. Only return the corrected code without explanations:\n\n${selectedText}`
      } else if (isRefactorCommand) {
        aiMessage = `Refactor the following code to improve its quality, readability, and performance. Only return the refactored code without explanations:\n\n${selectedText}`
      } else if (isCommentCommand) {
        // Remove the /comment prefix and use the rest as the message
        aiMessage = userMessage.substring(8).trim()
        if (hasSelection && selectedText) {
          aiMessage = `${aiMessage}\n\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\``
        }
      }

      const { promptContext, payload: contextPayload } = buildContextBundle({
        activeFile,
        files,
        fileContextIndex,
        selectedText,
        hasSelection,
      })

      let messageWithContext = aiMessage
      if (promptContext) {
        messageWithContext = `${aiMessage}\n\n---\nProject Context\n${promptContext}`
      }

      // Prepare request for AI service
      const aiRequest: EditorChatRequest = {
        message: messageWithContext,
        intent: aiMessage,
        original_user_message: userMessage,
        active_file: activeFile,
        file_content: files[activeFile]?.content,
        selected_text: selectedText,
        has_selection: hasSelection,
        max_tokens: 80000,
        context: contextPayload,
      }

      // Add user message to chat history
      const newChatHistory = [...chatHistory, { role: "user" as const, content: userMessage }]
      setChatHistory(newChatHistory)

      // Set AI provider if provided
      if (aiProvider) {
        aiService.setProvider(aiProvider)
      }

      // Send request to AI service
      const aiResponse = await aiService.sendEditorChat(aiRequest)

      // Add AI response to chat history
      const finalChatHistory = [...newChatHistory, { role: "assistant" as const, content: aiResponse.message }]
      setChatHistory(finalChatHistory)

      // Guardar automáticamente el chat
      try {
        // Si no hay sesión actual, crear una nueva
        if (!chatService.getCurrentSession()) {
          await chatService.startNewSession(chatService.generateChatName())
        }
        
        // Agregar los mensajes a la sesión actual
        chatService.addMessage('user', userMessage)
        chatService.addMessage('assistant', aiResponse.message)
        
        // Guardar la sesión
        await chatService.saveCurrentSession()
        console.log('Chat guardado automáticamente')
      } catch (error) {
        console.error('Error al guardar el chat:', error)
      }

      // Handle response based on command type
      if ((isFixCommand || isRefactorCommand) && hasSelection && selectedText) {
        // Fix/Refactor commands - modify the original file
        const codeBlocks = aiService.extractCodeBlocks(aiResponse.message)
        let codeToApply = codeBlocks.length > 0 ? codeBlocks[0] : aiResponse.message.trim()
        
        // Clean the code (remove markdown formatting if any)
        codeToApply = codeToApply.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
        
        // Apply the modification directly to the selected text
        editorActions.replaceSelectedText(codeToApply)
        
        console.log(`Applied ${isFixCommand ? 'fix' : 'refactor'} to selected code in ${activeFile}`)
        
  // Also save to chat file for history
  const currentChatContent = files[chatFilePath]?.content || defaultChatContent
        
        const updatedChatContent = currentChatContent + 
          `\n## User\n${userMessage}\n\n## AI Assistant\n${isFixCommand ? 'Fixed' : 'Refactored'} code in ${activeFile}\n\n\`\`\`\n${codeToApply}\n\`\`\`\n`
        
        if (!files[chatFilePath]) {
          onCreateFile(chatFilePath, updatedChatContent)
        } else {
          onUpdateFile(chatFilePath, updatedChatContent)
        }
      } else if (isCommentCommand) {
        // Comment command - insert AI response as comments in current file
        const cleanText = aiService.cleanResponseText(aiResponse.message)
        const commentedText = aiService.commentText(cleanText, activeFile)
        
        // Insert the commented text at cursor position or replace selection
        if (hasSelection && selectedText) {
          editorActions.replaceSelectedText(commentedText)
        } else {
          editorActions.insertCommentedText(commentedText)
        }
        
        console.log(`Inserted AI response as comments in ${activeFile}`)
        
  // Also save to chat file for history
  const currentChatContent = files[chatFilePath]?.content || defaultChatContent
        
        const updatedChatContent = currentChatContent + 
          `\n## User\n${userMessage}\n\n## AI Assistant\nInserted as comments in ${activeFile}:\n\n${aiResponse.message}\n`
        
        if (!files[chatFilePath]) {
          onCreateFile(chatFilePath, updatedChatContent)
        } else {
          onUpdateFile(chatFilePath, updatedChatContent)
        }
      } else {
        // Default behavior - save to chat file (even with selection)
  const currentChatContent = files[chatFilePath]?.content || defaultChatContent
        
        // Add user message and AI response to chat file
        const updatedChatContent = currentChatContent + 
          `\n## User\n${userMessage}\n\n## AI Assistant\n${aiResponse.message}\n`
        
        if (!files[chatFilePath]) {
          onCreateFile(chatFilePath, updatedChatContent)
        } else {
          onUpdateFile(chatFilePath, updatedChatContent)
        }

        // Switch to chat file automatically
        onSelectFile?.(chatFilePath)
      }

    } catch (error) {
      console.error("AI request failed:", error)
      
      // Add error to chat history
      const errorMessage = `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
      const errorChatHistory = [...chatHistory, 
        { role: "user" as const, content: userMessage },
        { role: "assistant" as const, content: errorMessage }
      ]
      setChatHistory(errorChatHistory)

      // Guardar el chat incluso en caso de error
      try {
        if (!chatService.getCurrentSession()) {
          await chatService.startNewSession(chatService.generateChatName())
        }
        chatService.addMessage('user', userMessage)
        chatService.addMessage('assistant', errorMessage)
        await chatService.saveCurrentSession()
        console.log('Chat con error guardado automáticamente')
      } catch (saveError) {
        console.error('Error al guardar el chat con error:', saveError)
      }

  // Update chat file with error (create if not exists)
  const currentContent = files[chatFilePath]?.content || defaultChatContent
      const errorContent = currentContent + `\n## User\n${userMessage}\n\n## AI Assistant\n${errorMessage}\n`
      if (!files[chatFilePath]) {
        onCreateFile(chatFilePath, errorContent)
      } else {
        onUpdateFile(chatFilePath, errorContent)
      }
      onSelectFile?.(chatFilePath)
    } finally {
      setIsLoading(false)
    }
  }

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <form onSubmit={handleSubmit} className="ai-command-bar flex items-center gap-2 px-4 py-2">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask AI about your code... Use /fix, /refactoriza, or /comment for special actions"
        className="flex-1 px-3 py-1 rounded text-sm outline-none focus:bg-[#323233] text-white-contrast"
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        className="disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded flex items-center gap-1 text-xs text-white-contrast"
      >
        <Send size={14} />
        {isLoading ? "..." : "Send"}
      </button>
    </form>
  )
}
