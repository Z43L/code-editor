"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
// @ts-ignore
// import { Linter } from 'eslint4b'
import { Save } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'


// const jsTsLinter = new Linter();

// Tipo para errores de sintaxis
type SyntaxError = {
  line: number;
  message: string;
};

// Placeholder para fileDiffService (debería importarse de lib/file-diff si existe)
const fileDiffService = {
  smartCodeReplacement: (content: string, selected: string, replacement: string) => content.replace(selected, replacement),
  createTempFile: (oldContent: string, newContent: string, path: string) => ({ oldContent, newContent, path })
};

// Mapeo de lenguajes soportados para carga dinámica
const languageImportMap: Record<string, () => Promise<any>> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  go: () => import('highlight.js/lib/languages/go'),
  java: () => import('highlight.js/lib/languages/java'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  xml: () => import('highlight.js/lib/languages/xml'),
  html: () => import('highlight.js/lib/languages/xml'),
  css: () => import('highlight.js/lib/languages/css'),
  json: () => import('highlight.js/lib/languages/json'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  bash: () => import('highlight.js/lib/languages/bash'),
  php: () => import('highlight.js/lib/languages/php'),
  ruby: () => import('highlight.js/lib/languages/ruby'),
}

// Función para registrar el lenguaje dinámicamente si no está registrado
const ensureLanguageRegistered = async (language: string) => {
  if (!language || language === 'text' || hljs.getLanguage(language)) return
  const importer = languageImportMap[language]
  if (importer) {
    try {
      const mod = await importer()
      hljs.registerLanguage(language, mod.default)
    } catch (e) {
      // No hacer nada si falla
    }
  }
}

// Detección de lenguaje por extensión
const getLanguageFromExtension = (filename: string = ""): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'java': return 'java';
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp': return 'cpp';
    case 'html': return 'html';
    case 'xml': return 'xml';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sh': return 'bash';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    default: return 'text';
  }
};

// Cálculo de número de líneas
const getLineCount = (content: string) => (content.match(/\n/g)?.length ?? 0) + 1;

// Highlight.js integration - versión línea por línea
const useHighlightContent = (code: string, language: string, settings: { syntaxHighlighting: boolean }) => {
  const [highlighted, setHighlighted] = useState('');
  useEffect(() => {
    let cancelled = false;
    const doHighlight = async () => {
      if (!settings.syntaxHighlighting) {
        setHighlighted(code);
        return;
      }
      await ensureLanguageRegistered(language);
      try {
        if (hljs.getLanguage(language)) {
          const result = hljs.highlight(code, { language });
          setHighlighted(result.value);
        } else {
          const result = hljs.highlightAuto(code);
          setHighlighted(result.value);
        }
      } catch {
        setHighlighted(code);
      }
    };
    doHighlight();
    return () => { cancelled = true; };
  }, [code, language, settings.syntaxHighlighting]);
  return highlighted;
};

// Función para resaltar línea por línea
const useHighlightLines = (lines: string[], language: string, settings: { syntaxHighlighting: boolean }) => {
  const [highlightedLines, setHighlightedLines] = useState<string[]>(lines);

  useEffect(() => {
    let cancelled = false;
    const doHighlight = async () => {
      if (!settings.syntaxHighlighting) {
        setHighlightedLines(lines);
        return;
      }

      await ensureLanguageRegistered(language);
      try {
        const hlLines = await Promise.all(lines.map(async (line) => {
          if (!line.trim()) return line; // Mantener líneas vacías como están
          if (hljs.getLanguage(language)) {
            const result = hljs.highlight(line, { language });
            return result.value;
          } else {
            const result = hljs.highlightAuto(line);
            return result.value;
          }
        }));
        if (!cancelled) {
          setHighlightedLines(hlLines);
        }
      } catch {
        if (!cancelled) {
          setHighlightedLines(lines);
        }
      }
    };
    doHighlight();
    return () => { cancelled = true; };
  }, [lines, language, settings.syntaxHighlighting]);

  return highlightedLines;
};

// --- Declaración del componente principal ---
interface EditorContentProps {
  file: { name: string; path: string; content?: string } | null;
  onContentChange: (content: string) => void;
  onSaveFile?: (path: string, content: string) => Promise<void>;
  onSaveAllFiles?: () => Promise<void>;
  onLoadFileContent?: (path: string) => Promise<string>;
  settings: {
    autosave: boolean;
    syntaxHighlighting: boolean;
    wordWrap: boolean;
  };
  showLineNumbers?: boolean;
  viewMode?: 'edit' | 'preview';
}

const EditorContent: React.FC<EditorContentProps> = ({
  file,
  onContentChange,
  onSaveFile,
  onSaveAllFiles,
  onLoadFileContent,
  settings,
  showLineNumbers = true,
  viewMode = 'edit',
}) => {
  // --- Estados principales ---
  const [content, setContent] = useState(file?.content || "");
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>("saved");
  const [lastSavedContent, setLastSavedContent] = useState(file?.content || "");
  const [currentFilePath, setCurrentFilePath] = useState(file?.path || "");
  const [history, setHistory] = useState<string[]>([file?.content || ""]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isUndoRedo, setIsUndoRedo] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [showEditor, setShowEditor] = useState(true);
  const [editorTextSizeClass] = useState('text-sm');
  const [isMarkdown, setIsMarkdown] = useState(() => file?.name?.endsWith('.md') || false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Estado para errores de sintaxis
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([]);
  // ---

  // --- Funciones auxiliares ---
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;
    // Sincronizar scroll con overlays
    if (overlayRef.current) {
      overlayRef.current.scrollTop = scrollTop;
      overlayRef.current.scrollLeft = scrollLeft;
    }
  };

  const useUndoRedo = (content: string, setContent: (c: string) => void, history: string[], setHistory: (h: string[]) => void, historyIndex: number, setHistoryIndex: (i: number) => void, setIsUndoRedo: (b: boolean) => void, onContentChange: (c: string) => void, lastSavedContent: string, setSaveStatus: (s: 'saved'|'unsaved'|'saving') => void) => {
    const undo = useCallback(() => {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setIsUndoRedo(true);
        setContent(history[newIndex]);
        setHistoryIndex(newIndex);
        onContentChange(history[newIndex]);
        if (history[newIndex] !== lastSavedContent) {
          setSaveStatus("unsaved");
        } else {
          setSaveStatus("saved");
        }
      }
    }, [history, historyIndex, onContentChange, lastSavedContent]);
    const redo = useCallback(() => {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setIsUndoRedo(true);
        setContent(history[newIndex]);
        setHistoryIndex(newIndex);
        onContentChange(history[newIndex]);
        if (history[newIndex] !== lastSavedContent) {
          setSaveStatus("unsaved");
        } else {
          setSaveStatus("saved");
        }
      }
    }, [history, historyIndex, onContentChange, lastSavedContent]);
    return { undo, redo };
  };

  // Sincronizar scroll del overlay cuando cambia el contenido
  useEffect(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [content]);

  // Sincronizar scroll inicial
  useEffect(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // --- Restaurar funciones y variables ---
  // Undo/Redo hooks
  const { undo, redo } = useUndoRedo(content, setContent, history, setHistory, historyIndex, setHistoryIndex, setIsUndoRedo, onContentChange, lastSavedContent, setSaveStatus);

  // Lenguaje y líneas
  const language = useMemo(() => getLanguageFromExtension(file?.name), [file?.name]);
  const lineCount = useMemo(() => getLineCount(content), [content]);
  const lines = useMemo(() => content.split('\n'), [content]);

  // Highlighted content - línea por línea para mejor sincronización
  const highlightedLines = useHighlightLines(lines, language, settings);

  // Estado para controlar análisis de linting
  const [isLinting, setIsLinting] = useState(false);

  // Limpiar errores de sintaxis cuando cambia el lenguaje
  useEffect(() => {
    setSyntaxErrors([]);
  }, [language]);

  // Función para analizar código con debouncing
  const analyzeCode = useCallback(async (code: string, lang: string, fileName?: string) => {
    if (isLinting) return; // Evitar múltiples análisis simultáneos

    setIsLinting(true);
    try {
      let endpoint = '';
      let body: any = { code };

      if (lang === 'python') {
        endpoint = '/api/pyright';
      } else if (lang === 'javascript' || lang === 'typescript') {
        endpoint = '/api/eslint';
        body.language = lang;
      } else if (lang === 'cpp' || lang === 'c') {
        endpoint = '/api/clangd';
        body.fileName = fileName || 'main.cpp';
      } else {
        setSyntaxErrors([]);
        return;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setSyntaxErrors(result.errors || []);
    } catch (err) {
      console.error('Linting error:', err);
      // No mostrar errores de linting como errores de sintaxis para evitar confusión
      setSyntaxErrors([]);
    } finally {
      setIsLinting(false);
    }
  }, [isLinting]);

  // Analizar código con debouncing
  useEffect(() => {
    if (!content.trim()) {
      setSyntaxErrors([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      analyzeCode(content, language, file?.name);
    }, 500); // 500ms de delay

    return () => clearTimeout(timeoutId);
  }, [content, language, file?.name, analyzeCode]);

  // --- Restaurar addToHistory antes de su uso ---
  const addToHistory = useCallback((newContent: string) => {
    if (isUndoRedo) {
      setIsUndoRedo(false);
      return;
    }
    if (history[historyIndex] === newContent) return;
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newContent);
    if (newHistory.length > 100) {
      newHistory.shift();
    } else {
      setHistoryIndex(historyIndex + 1);
    }
    setHistory(newHistory);
  }, [history, historyIndex, isUndoRedo]);

  // Optimized content change handler with debouncing
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    onContentChange(newContent)
    // Only mark as unsaved if content actually differs from last saved version
    if (newContent !== lastSavedContent) {
      setSaveStatus("unsaved")
    } else {
      setSaveStatus("saved")
    }
    // Add to history with a small delay to avoid too many entries
    setTimeout(() => addToHistory(newContent), 500)
  }, [onContentChange, addToHistory, lastSavedContent])

  // Update content when switching files (not when content changes within same file)
  useEffect(() => {
    const newFilePath = file?.path || ""
    const newContent = file?.content || ""
    
    // Only reset if we're switching to a different file
    if (newFilePath !== currentFilePath) {
      setCurrentFilePath(newFilePath)
      setContent(newContent)
      setLastSavedContent(newContent) // Initialize last saved content
      setSaveStatus("saved")
      // Reset history when switching files
      setHistory([newContent])
      setHistoryIndex(0)
      setIsUndoRedo(false)
    }
  }, [file?.path, currentFilePath]) // Only watch for path changes

  const saveFile = useCallback(async (filePath: string, fileContent: string) => {
    console.log("🚀 saveFile function called!");
    console.log("📂 FilePath:", filePath);
    console.log("📄 Content preview:", fileContent.slice(0, 100) + "...");
    console.log("🔌 onSaveFile exists:", !!onSaveFile);
    
    if (!onSaveFile) {
      console.log("❌ onSaveFile is null/undefined - ABORTING");
      return;
    }

    console.log("💾 Setting status to 'saving'...");
    setSaveStatus("saving");
    
    try {
      console.log("🔄 Calling onSaveFile...");
      await onSaveFile(filePath, fileContent);
      console.log("✅ onSaveFile completed successfully!");
      
      console.log("📝 Updating lastSavedContent...");
      setLastSavedContent(fileContent);
      
      console.log("💚 Setting status to 'saved'...");
      setSaveStatus("saved");
      
      console.log("🎉 Save process COMPLETED successfully for:", filePath);
    } catch (error) {
      console.error("💥 Save process FAILED:");
      console.error("❌ Error details:", error);
      console.log("🔴 Setting status back to 'unsaved'...");
      setSaveStatus("unsaved");
    }
  }, [onSaveFile]);

  // Keyboard shortcuts (separate from autosave to avoid re-registering on content changes)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only log save shortcuts to avoid spam
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        console.log("🎹 Key pressed:", { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.shiftKey });
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        console.log("🔑 Ctrl+Shift+S detected - Save All!");
        e.preventDefault();
        if (onSaveAllFiles) {
          console.log("📁 Calling saveAllFiles");
          onSaveAllFiles();
        } else {
          console.log("❌ onSaveAllFiles not available");
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        console.log("🔑 Ctrl+S detected!");
        e.preventDefault();
        if (file) {
          console.log("📁 File exists, calling saveFile");
          saveFile(file.path, content);
        } else {
          console.log("❌ No file to save");
        }
      } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      }
    };

    // Add listener to document for global coverage
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [file, content, undo, redo, saveFile, onSaveAllFiles]);

  // Autosave (separate effect)
  useEffect(() => {
    let autosaveTimeout: NodeJS.Timeout;
    if (settings.autosave && saveStatus === 'unsaved' && file) {
      console.log("⏰ Setting autosave timeout");
      autosaveTimeout = setTimeout(() => {
        console.log("💾 Autosave triggered");
        saveFile(file.path, content);
      }, 1500);
    }

    return () => {
      if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
      }
    };
  }, [settings.autosave, saveStatus, file, content, saveFile]);

  const handleTextSelection = useCallback(() => {
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart
      const end = textareaRef.current.selectionEnd
      const selected = content.substring(start, end)

      setSelectedText(selected)
      setSelectionStart(start)
      setSelectionEnd(end)
    }
  }, [content])

  const replaceSelectedText = useCallback((newText: string) => {
    if (selectedText.trim()) {
      const newContent = fileDiffService.smartCodeReplacement(content, selectedText, newText)
      handleContentChange(newContent)
    } else {
      const beforeSelection = content.substring(0, selectionStart)
      const afterSelection = content.substring(selectionEnd)
      const newContent = beforeSelection + newText + afterSelection
      handleContentChange(newContent)
    }
  }, [content, selectedText, selectionStart, selectionEnd, handleContentChange])

  const insertCommentedText = useCallback((text: string) => {
    const lines = text.split("\n")
    const commentedLines = lines.map((line) => {
      if (line.trim() === "") return line

      const extension = file?.name.split(".").pop()?.toLowerCase()
      switch (extension) {
        case "js":
        case "jsx":
        case "ts":
        case "tsx":
        case "java":
        case "c":
        case "cpp":
          return `// ${line}`
        case "py":
        case "sh":
          return `# ${line}`
        case "html":
        case "xml":
          return `<!-- ${line} -->`
        case "css":
          return `/* ${line} */`
        default:
          return `// ${line}`
      }
    })

    const commentedText = commentedLines.join("\n")
    const beforeSelection = content.substring(0, selectionStart)
    const afterSelection = content.substring(selectionEnd)
    const newContent = beforeSelection + commentedText + afterSelection
    handleContentChange(newContent)
  }, [content, selectionStart, selectionEnd, file?.name, handleContentChange])

  // Expose editor actions globally for AI integration
  useEffect(() => {
    const editorActions = {
      hasSelection: selectedText.length > 0,
      selectedText,
      replaceSelectedText,
      insertCommentedText,
      createTempModification: (code: string) => {
         if (selectedText.trim()) {
           const modifiedContent = fileDiffService.smartCodeReplacement(content, selectedText, code)
           return fileDiffService.createTempFile(content, modifiedContent, file?.path || '')
         }
         return null
       }
    }

    ;(window as any).editorActions = editorActions
  }, [selectedText, replaceSelectedText, insertCommentedText, content])

  if (!file) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center">
        <div className="text-gray-400 text-center">
          <div className="text-4xl mb-4">📄</div>
          <div className="text-lg">No hay archivo seleccionado</div>
          <div className="text-sm mt-2">Selecciona un archivo del explorador para comenzar a editar</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-[#1e1e1e] overflow-hidden flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d30] border-b border-[#3e3e3e]">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <span>📁</span>
          <span className="font-medium">{file.name}</span>
          <span className="text-gray-500">({language})</span>
          {saveStatus === "unsaved" && <span className="text-yellow-400" title="Archivo modificado">●</span>}
          {saveStatus === "saving" && <span className="text-blue-400" title="Guardando...">💾</span>}
          {onLoadFileContent && (
            <button
              onClick={async () => {
                try {
                  const realContent = await onLoadFileContent(file.path)
                  if (realContent) {
                    handleContentChange(realContent)
                  }
                } catch (error) {
                  // Only log errors that are not user cancellations
                  if ((error as Error).name !== 'AbortError') {
                    console.error('Error loading file:', error)
                  }
                }
              }}
              className="ml-2 px-2 py-1 bg-[#0e639c] hover:bg-[#1177bb] text-white text-xs rounded transition-colors"
              title="Cargar contenido real del archivo"
            >
              📂 Cargar
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Líneas: {lineCount}</span>
          <span>Caracteres: {content.length}</span>
          
          {/* Save Buttons */}
          <div className="flex items-center gap-1">
            {/* Save Current File */}
            <button
              onClick={() => {
                console.log("🖱️ BUTTON CLICKED - Save button!");
                console.log("📁 File exists:", !!file);
                console.log("📄 File path:", file?.path);
                console.log("📝 Content length:", content.length);
                console.log("� Save status:", saveStatus);
                if (file) {
                  console.log("✅ Calling saveFile function...");
                  saveFile(file.path, content);
                } else {
                  console.log("❌ No file to save");
                }
              }}
              disabled={saveStatus === "saving" || !file}
              className={`flex items-center justify-center w-8 h-8 rounded transition-all duration-200 ${
                saveStatus === "unsaved" 
                  ? "bg-[#2d2d30] hover:bg-[#3a3a3a] text-yellow-400 border border-yellow-400/30" 
                  : saveStatus === "saving"
                  ? "bg-[#2d2d30] text-blue-400 cursor-not-allowed"
                  : "bg-[#1a1a1a] hover:bg-[#2d2d30] text-gray-500 border border-gray-600/30"
              }`}
              title={
                saveStatus === "unsaved" 
                  ? "Guardar archivo actual (Ctrl+S)" 
                  : saveStatus === "saving" 
                  ? "Guardando..." 
                  : "Archivo guardado"
              }
            >
              <Save className="h-4 w-4" />
            </button>
            
            {/* Save All Files */}
            {onSaveAllFiles && (
              <button
                onClick={async () => {
                  try {
                    console.log("🖱️ Save all button clicked");
                    await onSaveAllFiles();
                  } catch (error) {
                    console.error("Error saving all files:", error);
                  }
                }}
                className="flex items-center justify-center w-8 h-8 rounded transition-all duration-200 bg-[#1a1a1a] hover:bg-[#2d2d30] text-gray-400 border border-gray-600/30 hover:text-white"
                title="Guardar todos los archivos sin guardar (Ctrl+Shift+S)"
              >
                <div className="relative">
                  <Save className="h-3 w-3" />
                  <Save className="h-3 w-3 absolute -top-0.5 -right-0.5 opacity-60" />
                </div>
              </button>
            )}
          </div>
          
          {saveStatus === "saving" && <span className="text-blue-400">Guardando...</span>}
          {saveStatus === "saved" && <span className="text-green-400">Guardado</span>}
          {saveStatus === "unsaved" && <span className="text-yellow-400">Sin guardar</span>}
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Line Numbers */}
          {showLineNumbers && (
            <div className="absolute left-0 top-0 bg-[#1e1e1e] text-[#858585] leading-6 px-2 py-4 select-none w-[60px] border-r border-[#3e3e3e] overflow-hidden z-10">
              <div 
                className="overflow-hidden"
                style={{ 
                  transform: `translateY(-${scrollTop}px)`,
                  transition: 'none'
                }}
              >
                {lines.map((_: string, i: number) => (
                  <div key={i + 1} className={`text-left h-6 flex items-center justify-start pl-1 ${isMarkdown ? 'text-base' : 'text-sm'}`}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlay con errores de sintaxis debajo de cada línea */}
          {showEditor && settings.syntaxHighlighting && (
            <div
              ref={overlayRef}
              className={`absolute inset-0 ${showLineNumbers ? 'pl-[68px]' : 'pl-4'} pr-4 pt-4 pb-4 leading-6 font-mono pointer-events-none overflow-hidden text-white ${editorTextSizeClass} ${
                settings.wordWrap ? "whitespace-pre-wrap" : "whitespace-pre"
              }`}
              style={{
                background: 'transparent',
                caretColor: 'transparent',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                zIndex: 5,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                tabSize: 2,
                overflowWrap: settings.wordWrap ? "break-word" : "normal",
                wordBreak: settings.wordWrap ? "break-word" : "normal",
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
                fontSize: '14px',
                lineHeight: '24px',
              }}
            >
              {lines.map((line: string, i: number) => (
                <div key={i} style={{ position: 'relative', lineHeight: '24px', minHeight: '24px' }}>
                  {settings.syntaxHighlighting ? (
                    <span dangerouslySetInnerHTML={{ __html: highlightedLines[i] || line }} />
                  ) : (
                    <span>{line}</span>
                  )}
                  {syntaxErrors.filter((e: SyntaxError) => e.line === i + 1).map((err: SyntaxError, idx: number) => (
                    <div key={idx} className="text-xs text-red-400 bg-[#2d0a0a] rounded px-2 py-1 mt-1 mb-1 w-fit">
                      {err.message}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Main Textarea */}
          {showEditor && (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onSelect={handleTextSelection}
              onMouseUp={handleTextSelection}
              onKeyUp={handleTextSelection}
              onScroll={handleScroll}
              className={`w-full h-full bg-transparent ${settings.syntaxHighlighting ? 'text-transparent' : 'text-white'} caret-white ${editorTextSizeClass} leading-6 ${showLineNumbers ? 'pl-[68px]' : 'pl-4'} pr-4 pt-4 pb-4 resize-none outline-none font-mono relative z-10 scrollbar-thin scrollbar-track-[#2d2d30] scrollbar-thumb-[#555]`}
              style={{
                minHeight: "100%",
                whiteSpace: settings.wordWrap ? "pre-wrap" : "pre",
                overflowWrap: settings.wordWrap ? "break-word" : "normal",
                wordBreak: settings.wordWrap ? "break-word" : "normal",
                tabSize: 2,
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace',
                fontSize: '14px',
                lineHeight: '24px',
              }}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              placeholder={content ? "" : "Comienza a escribir tu código aquí..."}
            />
          )}

          {isMarkdown && viewMode === "preview" && (
            <div className="absolute inset-0 overflow-auto p-6 bg-[#1e1e1e] markdown-preview">
              <div className="max-w-3xl mx-auto">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{}}>
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditorContent;