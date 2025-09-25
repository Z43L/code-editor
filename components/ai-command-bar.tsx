"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Send } from "lucide-react"
import type { FileItem } from "./flutter-editor"
import { aiService, type EditorChatRequest, type AIProvider } from "../lib/ai-service"
import { fileDiffService } from "../lib/file-diff"
import { chatService } from "../lib/chat-service"

interface AICommandBarProps {
  activeFile: string
  files: Record<string, FileItem>
  onUpdateFile: (filePath: string, content: string) => void
  onCreateFile: (filePath: string, content: string) => void
  aiProvider?: AIProvider
  chatFileName?: string
  onSelectFile?: (filePath: string) => void
}

export function AICommandBar({ activeFile, files, onUpdateFile, onCreateFile, aiProvider, chatFileName = "chat.md", onSelectFile }: AICommandBarProps) {
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

    try {
      // Check if user has selected text
      const editorActions = (window as any).editorActions
      const hasSelection = editorActions?.hasSelection || false
      const selectedText = editorActions?.selectedText || ""

      // Detect special commands
      const isFixCommand = userMessage.toLowerCase().startsWith('/fix')
      const isRefactorCommand = userMessage.toLowerCase().startsWith('/refactoriza')
      const isCommentCommand = userMessage.toLowerCase().startsWith('/comment')
      const isSpecialCommand = isFixCommand || isRefactorCommand || isCommentCommand

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

      // Prepare request for AI service
      const aiRequest: EditorChatRequest = {
        message: aiMessage,
        active_file: activeFile,
        file_content: files[activeFile]?.content,
        selected_text: selectedText,
        has_selection: hasSelection,
        max_tokens: 1000
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
        const chatFileName_clean = (chatFileName || "chat.md").trim() || "chat.md"
        const chatFilePath = `chats/${chatFileName_clean}`
        const currentChatContent = files[chatFilePath]?.content || "# AI Chat History\n\n"
        
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
        const chatFileName_clean = (chatFileName || "chat.md").trim() || "chat.md"
        const chatFilePath = `chats/${chatFileName_clean}`
        const currentChatContent = files[chatFilePath]?.content || "# AI Chat History\n\n"
        
        const updatedChatContent = currentChatContent + 
          `\n## User\n${userMessage}\n\n## AI Assistant\nInserted as comments in ${activeFile}:\n\n${aiResponse.message}\n`
        
        if (!files[chatFilePath]) {
          onCreateFile(chatFilePath, updatedChatContent)
        } else {
          onUpdateFile(chatFilePath, updatedChatContent)
        }
      } else {
        // Default behavior - save to chat file (even with selection)
        const chatFileName_clean = (chatFileName || "chat.md").trim() || "chat.md"
        const chatFilePath = `chats/${chatFileName_clean}`
        const currentChatContent = files[chatFilePath]?.content || "# AI Chat History\n\n"
        
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
      const chatFileName_clean = (chatFileName || "chat.md").trim() || "chat.md"
      const chatFilePath = `chats/${chatFileName_clean}`
      const currentContent = files[chatFilePath]?.content || "# AI Chat History\n\n"
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
