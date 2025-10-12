"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
// @ts-ignore
// import { Linter } from 'eslint4b'
import { Save } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTypeScript } from '../hooks/use-typescript'
import { useLanguageService } from '../hooks/use-language-service'
import { TypeScriptAutocomplete } from './typescript-autocomplete'
import { TypeScriptSignatureHelp } from './typescript-signature-help'
import { TypeScriptQuickFixes } from './typescript-quick-fixes'


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

import type { AIProvider } from "../lib/ai-service"

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
    aiHover: boolean;
    hover: boolean;
  };
  showLineNumbers?: boolean;
  viewMode?: 'edit' | 'preview';
  projectContext?: Record<string, any>;
  aiProvider?: AIProvider;
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
  projectContext,
  aiProvider,
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

  // Hook para servicios de lenguaje (soporta múltiples lenguajes)
  const { getCompletions, getHover, getDefinition, getSignatureHelp, getDiagnostics, updateFile } = useLanguageService(file?.name);

  // Estados para autocompletado TypeScript
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<any[]>([]);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);

  // Estados para hover tooltip TypeScript
  const [showHoverTooltip, setShowHoverTooltip] = useState(false);
  const [hoverTooltipInfo, setHoverTooltipInfo] = useState<any>(null);
  const [hoverTooltipPosition, setHoverTooltipPosition] = useState({ top: 0, left: 0 });
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  // Estados para errores TypeScript
  const [typescriptErrors, setTypescriptErrors] = useState<any[]>([]);
  const [showErrorPanel, setShowErrorPanel] = useState(false);

  // Estados para signature help TypeScript
  const [showSignatureHelp, setShowSignatureHelp] = useState(false);
  const [signatureHelpInfo, setSignatureHelpInfo] = useState<any>(null);

  const [signatureHelpPosition, setSignatureHelpPosition] = useState({ top: 0, left: 0 });

  // Estados para quick fixes TypeScript
  const [showQuickFixes, setShowQuickFixes] = useState(false);
  const [quickFixes, setQuickFixes] = useState<any[]>([]);
  const [quickFixesPosition, setQuickFixesPosition] = useState({ top: 0, left: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  // Estados para errores de sintaxis
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([]);
  const [showSyntaxErrorPanel, setShowSyntaxErrorPanel] = useState(false);
  // Estados para file watching
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [externalChangeContent, setExternalChangeContent] = useState<string>('');
  const fileWatcherRef = useRef<EventSource | null>(null);
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

  // Resetear cursor al inicio cuando cambia el archivo
  useEffect(() => {
    if (file && textareaRef.current) {
      // Pequeño delay para asegurar que el contenido se haya actualizado
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = 0;
          textareaRef.current.selectionEnd = 0;
          textareaRef.current.focus();
        }
      }, 10);
    }
  }, [file?.path]); // Solo cuando cambia la ruta del archivo

  // Función para analizar código con debouncing
  const analyzeCode = useCallback(async (code: string, lang: string, fileName?: string) => {
    if (isLinting) return; // Evitar múltiples análisis simultáneos

    setIsLinting(true);
    try {
      let endpoint = '';
      let body: any = { code };

      if (lang === 'python') {
        endpoint = '/api/pyright';
        body = { fileName: fileName || 'main.py', content: code };
      } else if (lang === 'javascript' || lang === 'typescript') {
        endpoint = '/api/eslint';
        body.language = lang;
      } else if (lang === 'cpp' || lang === 'c') {
        endpoint = '/api/clangd';
        body = { fileName: fileName || 'main.cpp', content: code };
      } else if (lang === 'go') {
        endpoint = '/api/go/diagnostics';
        body = { fileName: fileName || 'main.go', content: code };
      } else if (lang === 'java') {
        endpoint = '/api/java/diagnostics';
        body = { fileName: fileName || 'Main.java', content: code };
      } else if (lang === 'html') {
        endpoint = '/api/html/diagnostics';
        body = { fileName: fileName || 'index.html', content: code };
      } else if (lang === 'css') {
        endpoint = '/api/css/diagnostics';
        body = { fileName: fileName || 'styles.css', content: code };
      } else if (lang === 'json') {
        endpoint = '/api/json/diagnostics';
        body = { fileName: fileName || 'data.json', content: code };
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

      // Mapear errores al formato esperado
      let mappedErrors: SyntaxError[] = [];
      const rawErrors = result.errors || result.diagnostics || [];

      if (lang === 'cpp' || lang === 'c') {
        // Para C/C++, mapear los errores de clangd al formato SyntaxError
        mappedErrors = rawErrors.map((err: any) => ({
          line: err.line || 1,
          message: err.message || 'Error desconocido'
        }));
      } else {
        // Para otros lenguajes, usar el formato directo
        mappedErrors = rawErrors;
      }

      setSyntaxErrors(mappedErrors);
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

  // Función para detectar y procesar marcadores $$ de IA
  const detectAndProcessAICodeMarkers = useCallback(async (content: string) => {
    // Buscar patrón $$ ... $$ en comentarios
    const aiMarkerRegex = /\/\/\s*\$\$\s*(.*?)\s*\$\$/g;
    const matches = [...content.matchAll(aiMarkerRegex)];

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const request = lastMatch[1].trim();

      if (request) {
        try {
          // Extraer contexto del archivo (100 líneas antes y después)
          const lines = content.split('\n');
          const matchIndex = content.indexOf(lastMatch[0]);
          const beforeContent = content.substring(0, matchIndex);
          const beforeLines = beforeContent.split('\n').length - 1;

          const startLine = Math.max(0, beforeLines - 100);
          const endLine = Math.min(lines.length, beforeLines + 101); // +1 para incluir la línea del marcador

          const fileContext = lines.slice(startLine, endLine).join('\n');

          // Llamar a la API de IA (sin contexto de proyecto por ahora)
          const response = await fetch('/api/ai/code', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              request,
              language: language || 'javascript',
              fileContext,
              projectContext: {}, // TODO: Agregar contexto del proyecto
              provider: aiProvider
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const generatedCode = data.code;

            // Reemplazar el marcador con el código generado
            const newContent = content.replace(lastMatch[0], generatedCode);
            setContent(newContent);
            onContentChange(newContent);
            setSaveStatus("unsaved");
          }
        } catch (error) {
          console.error('Error procesando marcador IA:', error);
        }
      }
    }
  }, [language, onContentChange]);

  // Optimized content change handler with debouncing
  const handleContentChange = useCallback((newContent: string, skipAutoClose?: boolean) => {
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

    // Manejar autocompletado para todos los lenguajes
    if (file?.name && !skipAutoClose) {
      setIsTyping(true);
      // Ocultar autocompletado mientras se escribe
      setShowAutocomplete(false);

      // Mostrar sugerencias después de un breve delay
      setTimeout(() => {
        if (textareaRef.current) {
          const cursorPos = textareaRef.current.selectionStart;
          showTypeScriptSuggestions(cursorPos);

          // Verificar si hay un paréntesis antes del cursor para mostrar signature help
          const charBefore = newContent.charAt(cursorPos - 1);
          if (charBefore === '(') {
            showTypeScriptSignatureHelp(cursorPos);
          } else if (charBefore === ')') {
            hideTypeScriptSignatureHelp();
          }
        }
        setIsTyping(false);
      }, 150); // 150ms delay para evitar spam
    }

    // Detectar y procesar marcadores $$ para generación de código con IA
    if (!skipAutoClose) {
      detectAndProcessAICodeMarkers(newContent);
    }
  }, [onContentChange, addToHistory, lastSavedContent, file?.name])

  // Funciones para autocompletado TypeScript
  const getCursorPosition = useCallback(() => {
    if (!textareaRef.current) return { top: 0, left: 0 };

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;

    // Crear un elemento temporal para medir la posición
    const div = document.createElement('div');
    const styles = window.getComputedStyle(textarea);

    // Copiar estilos relevantes
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.font = styles.font;
    div.style.fontSize = styles.fontSize;
    div.style.fontFamily = styles.fontFamily;
    div.style.lineHeight = styles.lineHeight;
    div.style.padding = styles.padding;
    div.style.border = styles.border;
    div.style.width = styles.width;
    div.style.height = styles.height;
    div.style.overflow = 'auto';
    div.style.resize = 'none';

    // Crear texto hasta la posición del cursor
    const textBeforeCursor = content.substring(0, start);
    div.textContent = textBeforeCursor;

    // Agregar un span al final para marcar la posición
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);

    document.body.appendChild(div);

    // Obtener la posición del span
    const rect = span.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();

    document.body.removeChild(div);

    return {
      top: rect.top - textareaRect.top + textarea.scrollTop + 20, // 20px offset
      left: rect.left - textareaRect.left + textarea.scrollLeft
    };
  }, [content]);

  const showTypeScriptSuggestions = useCallback(async (cursorPos: number) => {
    if (!file?.name) {
      setShowAutocomplete(false);
      return;
    }

    try {
      // Primero actualizar el archivo en el servidor con el contenido actual
      await updateFile(content);

      // Luego obtener las sugerencias
      const suggestions = await getCompletions(content, cursorPos);
      if (suggestions && suggestions.length > 0) {
        const position = getCursorPosition();
        setAutocompleteSuggestions(suggestions);
        setAutocompletePosition(position);
        setSelectedSuggestionIndex(0);
        setShowAutocomplete(false);
      } else {
        setShowAutocomplete(false);
      }
    } catch (error) {
      console.error('Language service completions error:', error);
      setShowAutocomplete(false);
    }
  }, [file?.name, content, updateFile, getCompletions, getCursorPosition]);

  const hideAutocomplete = useCallback(() => {
    setShowAutocomplete(false);
    setAutocompleteSuggestions([]);
  }, []);

  const selectSuggestion = useCallback((suggestion: any) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Determinar el texto a insertar
    const insertText = suggestion.insertText || suggestion.label;

    // Insertar el texto
    const newContent = content.substring(0, start) + insertText + content.substring(end);
    setContent(newContent);
    onContentChange(newContent);

    // Mover el cursor al final del texto insertado
    const newCursorPos = start + insertText.length;
    setTimeout(() => {
      textarea.setSelectionRange(newCursorPos, newCursorPos);
      textarea.focus();
    }, 0);

    hideAutocomplete();
  }, [content, onContentChange, hideAutocomplete]);

  // Funciones para hover tooltip
  const showHoverTooltipAt = useCallback(async (clientX: number, clientY: number, position: number) => {
    if (!file?.name) {
      return;
    }

    try {
      const result = await getHover(content, position);
      if (result) {
        setHoverTooltipInfo(result.contents);
        setHoverTooltipPosition({ top: clientY + 10, left: clientX + 10 });
        setShowHoverTooltip(true);
      }
    } catch (error) {
      console.error('Error getting hover info:', error);
    }
  }, [file?.name, content, getHover]);

  const hideHoverTooltip = useCallback(() => {
    setShowHoverTooltip(false);
    setHoverTooltipInfo(null);
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  }, [hoverTimeout]);

  const handleMouseOver = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    // Hover functionality removed
  }, []);

  const handleMouseOut = useCallback(() => {
    // Limpiar timeout si el mouse sale antes de los 500ms
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  }, [hoverTimeout]);

  // Funciones para errores
  const getTypeScriptErrors = useCallback(async () => {
    if (!file?.name) {
      setTypescriptErrors([]);
      return;
    }

    // Guardar la posición del cursor antes de la operación asíncrona
    const savedSelectionStart = textareaRef.current?.selectionStart || 0;
    const savedSelectionEnd = textareaRef.current?.selectionEnd || 0;

    try {
      const diagnostics = await getDiagnostics(content);
      setTypescriptErrors(diagnostics.map(d => ({
        file: file.name,
        start: d.range.start.character,
        length: d.range.end.character - d.range.start.character,
        message: d.message,
        category: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 0,
        code: d.code || '',
        line: d.range.start.line,
        character: d.range.start.character
      })));

      // Restaurar la posición del cursor después de la operación asíncrona
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = savedSelectionStart;
          textareaRef.current.selectionEnd = savedSelectionEnd;
          textareaRef.current.focus();
        }
      }, 0);
    } catch (error) {
      console.error('Error getting diagnostics:', error);
      setTypescriptErrors([]);
    }
  }, [file?.name, content, getDiagnostics]);

  const toggleErrorPanel = useCallback(() => {
    setShowErrorPanel(!showErrorPanel);
  }, [showErrorPanel]);

  const toggleSyntaxErrorPanel = useCallback(() => {
    setShowSyntaxErrorPanel(!showSyntaxErrorPanel);
  }, [showSyntaxErrorPanel]);

  // Función para ir a definición
  const goToDefinition = useCallback(async (position: number) => {
    if (!file?.name) {
      return;
    }

    try {
      const definition = await getDefinition(content, position);
      if (definition) {
        console.log('🎯 Definition found:', definition);
        // Aquí podríamos implementar la navegación al archivo y línea
        // Por ahora solo mostramos en consola
        alert(`Definition found at ${definition.uri}:${definition.range.start.line + 1}:${definition.range.start.character + 1}`);
      } else {
        console.log('❌ No definition found');
      }
    } catch (error) {
      console.error('Error going to definition:', error);
    }
  }, [file?.name, content, getDefinition]);

  // Función para mostrar signature help
  const showTypeScriptSignatureHelp = useCallback(async (position: number) => {
    if (!file?.name) {
      setShowSignatureHelp(false);
      return;
    }

    try {
      const signatureHelp = await getSignatureHelp(content, position);
      if (signatureHelp) {
        const pos = getCursorPosition();
        setSignatureHelpInfo(signatureHelp);
        setSignatureHelpPosition({ top: pos.top - 50, left: pos.left }); // Mostrar arriba del cursor
        setShowSignatureHelp(true);
      } else {
        setShowSignatureHelp(false);
      }
    } catch (error) {
      console.error('Error getting signature help:', error);
      setShowSignatureHelp(false);
    }
  }, [file?.name, content, getSignatureHelp, getCursorPosition]);

  const hideTypeScriptSignatureHelp = useCallback(() => {
    setShowSignatureHelp(false);
    setSignatureHelpInfo(null);
  }, []);

  // Función para mostrar quick fixes
  const showTypeScriptQuickFixes = useCallback(async (start: number, length: number) => {
    if (!file?.name) {
      setShowQuickFixes(false);
      return;
    }

    try {
      // For now, get diagnostics and create basic quick fixes
      const diagnostics = await getDiagnostics(content);
      const relevantDiagnostics = diagnostics.filter(d =>
        d.range.start.character >= start && d.range.start.character <= start + length
      );

      if (relevantDiagnostics.length > 0) {
        const fixes = relevantDiagnostics.map(d => ({
          description: `Fix: ${d.message}`,
          changes: [{
            fileName: file.name,
            textChanges: [{
              span: { start: d.range.start.character, length: d.range.end.character - d.range.start.character },
              newText: '' // Basic fix - could be improved
            }]
          }]
        }));

        const pos = getCursorPosition();
        setQuickFixes(fixes);
        setQuickFixesPosition({ top: pos.top + 20, left: pos.left });
        setShowQuickFixes(true);
      } else {
        setShowQuickFixes(false);
      }
    } catch (error) {
      console.error('Error getting quick fixes:', error);
      setShowQuickFixes(false);
    }
  }, [file?.name, content, getDiagnostics, getCursorPosition]);

  const hideTypeScriptQuickFixes = useCallback(() => {
    setShowQuickFixes(false);
    setQuickFixes([]);
  }, []);

  // Función para aplicar quick fix
  const applyQuickFix = useCallback(async (fix: any) => {
    if (!file?.name) return;

    try {
      console.log('Applying quick fix:', fix);

      // Aplicar los cambios del fix al contenido
      let newContent = content;
      if (fix.changes && fix.changes.length > 0) {
        // Ordenar los cambios por posición inversa para evitar conflictos de índices
        const sortedChanges = fix.changes
          .flatMap((change: any) => change.textChanges || [])
          .sort((a: any, b: any) => b.span.start - a.span.start);

        for (const change of sortedChanges) {
          const { start, length } = change.span;
          const { newText } = change;

          // Aplicar el cambio
          newContent = newContent.substring(0, start) + newText + newContent.substring(start + length);
        }
      }

      // Actualizar el contenido del editor
      handleContentChange(newContent);

      // Ocultar el panel de quick fixes
      hideTypeScriptQuickFixes();

      console.log('Quick fix applied successfully');
    } catch (error) {
      console.error('Error applying quick fix:', error);
    }
  }, [file?.name, content, handleContentChange, hideTypeScriptQuickFixes]);

  // Funciones para manejar cambios externos
  const acceptExternalChange = useCallback(() => {
    console.log('[File Watch] Accepting external change');
    setContent(externalChangeContent);
    onContentChange(externalChangeContent);
    setLastSavedContent(externalChangeContent);
    setSaveStatus('saved');
    setExternalChangeDetected(false);
    setExternalChangeContent('');
    // Actualizar history
    addToHistory(externalChangeContent);
  }, [externalChangeContent, onContentChange, addToHistory]);

  const rejectExternalChange = useCallback(() => {
    console.log('[File Watch] Rejecting external change');
    setExternalChangeDetected(false);
    setExternalChangeContent('');
  }, []);

  // Función de ejemplo para obtener sugerencias
  const handleGetTypeScriptSuggestions = useCallback(async (cursorPosition: number) => {
    if (!file?.name) {
      return []; // Solo funciona si hay un archivo
    }

    try {
      console.log('🔍 Solicitando sugerencias...');
      const suggestions = await getCompletions(content, cursorPosition);
      console.log('💡 Sugerencias obtenidas:', suggestions.length);
      return suggestions;
    } catch (error) {
      console.error('❌ Error obteniendo sugerencias:', error);
      return [];
    }
  }, [file?.name, content, getCompletions]);

  // Función para actualizar archivo en el servicio
  const handleUpdateTypeScriptFile = useCallback(async () => {
    if (!file?.name) {
      return;
    }

    try {
      console.log('🔄 Actualizando archivo en el servicio...');
      await updateFile(content);
      console.log('✅ Archivo actualizado');
    } catch (error) {
      console.error('❌ Error actualizando archivo:', error);
    }
  }, [file?.name, content, updateFile]);

  // Actualizar archivo cuando cambie el contenido
  useEffect(() => {
    if (content && file?.name) {
      const timeoutId = setTimeout(() => {
        handleUpdateTypeScriptFile();
      }, 300); // Debounce de 300ms

      return () => clearTimeout(timeoutId);
    }
  }, [content, file?.name, handleUpdateTypeScriptFile]);

  // Obtener errores cuando cambie el contenido
  useEffect(() => {
    if (content && file?.name) {
      // Solo ejecutar diagnostics para archivos que los soporten
      const isCppFile = file.name.match(/\.(cpp|cxx|cc|c\+\+|c|h|hpp|hxx)$/i);
      const isPythonFile = file.name.match(/\.py$/i);
      const isGoFile = file.name.match(/\.go$/i);
      const isJavaFile = file.name.match(/\.java$/i);
      if (!isCppFile && !isPythonFile && !isGoFile && !isJavaFile) return;

      // No ejecutar diagnostics mientras el usuario está escribiendo activamente
      if (isTyping) return;

      const timeoutId = setTimeout(() => {
        // Verificar nuevamente que no estamos escribiendo antes de ejecutar
        if (!isTyping) {
          getTypeScriptErrors();
        }
      }, isCppFile ? 2000 : isGoFile ? 1800 : isJavaFile ? 2000 : 1500); // 2s para C++/Java, 1.8s para Go, 1.5s para Python

      return () => clearTimeout(timeoutId);
    } else {
      setTypescriptErrors([]);
    }
  }, [content, file?.name, getTypeScriptErrors, isTyping]);

  // File watcher: detectar cambios externos en el archivo
  useEffect(() => {
    if (!file?.path) return;

    console.log('[File Watch] Setting up watcher for:', file.path);

    // Cerrar watcher anterior si existe
    if (fileWatcherRef.current) {
      fileWatcherRef.current.close();
      fileWatcherRef.current = null;
    }

    // Crear conexión SSE para este archivo
    const eventSource = new EventSource(
      `/api/files/watch?filePath=${encodeURIComponent(file.path)}`
    );
    fileWatcherRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[File Watch] Connection established for:', file.path);
    };

    eventSource.onmessage = (event) => {
      // Ignorar mensajes vacíos (keep-alive)
      if (!event.data || event.data.trim() === '' || event.data.startsWith(':')) {
        return;
      }

      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'connected':
            console.log('[File Watch] File watch connected:', message);
            break;

          case 'changed':
            console.log('[File Watch] File changed externally:', file.path);
            // Solo notificar si el contenido es diferente al actual
            if (message.content !== content) {
              setExternalChangeContent(message.content);
              setExternalChangeDetected(true);
            }
            break;

          case 'deleted':
            console.log('[File Watch] File deleted:', file.path);
            // Podrías mostrar un mensaje al usuario aquí
            break;
        }
      } catch (error) {
        // Silenciar errores de parsing para keep-alive
        if (event.data && event.data !== ':') {
          console.error('[File Watch] Failed to parse SSE message:', error, event.data);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error('[File Watch] SSE error:', error);
    };

    // Cleanup al desmontar o cambiar de archivo
    return () => {
      console.log('[File Watch] Cleaning up watcher for:', file.path);
      if (fileWatcherRef.current) {
        fileWatcherRef.current.close();
        fileWatcherRef.current = null;
      }
    };
  }, [file?.path]);

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
      // Verificar si el elemento activo es parte de la terminal
      const activeElement = document.activeElement;
      const isInTerminal = activeElement?.closest('.terminal-panel') !== null ||
                          activeElement?.tagName === 'INPUT' &&
                          activeElement?.getAttribute('placeholder')?.includes('comando');

      // Si estamos en la terminal, solo permitir atajos de guardado globales
      if (isInTerminal) {
        // Solo permitir Ctrl+S y Ctrl+Shift+S cuando estamos en la terminal
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
        }
        // No procesar otros atajos de teclado cuando estamos en la terminal
        return;
      }

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
      } else if (e.key === 'Tab') {
        // Prevent Tab from moving focus to AI command bar
        e.preventDefault();
        // Insert a tab character instead
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const tabChar = '  '; // 2 spaces for tab

          // Si hay texto seleccionado, indentar todas las líneas
          if (start !== end) {
            const selectedText = content.substring(start, end);
            const lines = selectedText.split('\n');

            if (e.shiftKey) {
              // Shift+Tab: Desindentar
              const deindentedLines = lines.map(line => {
                if (line.startsWith('  ')) {
                  return line.substring(2);
                } else if (line.startsWith('\t')) {
                  return line.substring(1);
                }
                return line;
              });
              const newSelectedText = deindentedLines.join('\n');
              const newContent = content.substring(0, start) + newSelectedText + content.substring(end);
              setContent(newContent);
              onContentChange(newContent);

              setTimeout(() => {
                textarea.setSelectionRange(start, start + newSelectedText.length);
              }, 0);
            } else {
              // Tab: Indentar
              const indentedLines = lines.map(line => tabChar + line);
              const newSelectedText = indentedLines.join('\n');
              const newContent = content.substring(0, start) + newSelectedText + content.substring(end);
              setContent(newContent);
              onContentChange(newContent);

              setTimeout(() => {
                textarea.setSelectionRange(start, start + newSelectedText.length);
              }, 0);
            }
          } else {
            // Si no hay selección, insertar tab simple
            const newContent = content.substring(0, start) + tabChar + content.substring(end);
            setContent(newContent);
            onContentChange(newContent);

            // Move cursor after the inserted tab
            setTimeout(() => {
              textarea.setSelectionRange(start + tabChar.length, start + tabChar.length);
            }, 0);
          }
        }
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
      {/* Banner de cambio externo detectado */}
      {externalChangeDetected && (
        <div className="bg-yellow-600/90 border-b border-yellow-700 px-4 py-3 flex items-center justify-between z-50">
          <div className="flex items-center gap-3">
            <span className="text-yellow-100 text-sm font-medium">
              ⚠️ El archivo ha sido modificado externamente
            </span>
            <span className="text-yellow-200 text-xs">
              ¿Deseas recargar el contenido?
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={acceptExternalChange}
              className="px-3 py-1 bg-yellow-700 hover:bg-yellow-800 text-white text-xs rounded transition-colors"
            >
              Aceptar cambios
            </button>
            <button
              onClick={rejectExternalChange}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-800 text-white text-xs rounded transition-colors"
            >
              Mantener actual
            </button>
          </div>
        </div>
      )}

      {/* Panel de Errores de Sintaxis */}
      {syntaxErrors.length > 0 && (
        <div className="fixed top-0 right-0 z-40 bg-red-900/90 border-l border-b border-red-700 rounded-bl-lg max-w-md max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between p-2 border-b border-red-700">
            <span className="text-red-200 text-sm font-medium">
              Syntax Errors ({syntaxErrors.length})
            </span>
            <button
              onClick={toggleSyntaxErrorPanel}
              className="text-red-400 hover:text-red-200 text-sm"
            >
              {showSyntaxErrorPanel ? '▲' : '▼'}
            </button>
          </div>
          {showSyntaxErrorPanel && (
            <div className="p-2 space-y-1">
              {syntaxErrors.slice(0, 10).map((error, index) => (
                <div key={index} className="text-xs text-red-200 bg-red-800/50 rounded p-2">
                  <div className="font-medium">Line {error.line}: {error.message}</div>
                </div>
              ))}
              {syntaxErrors.length > 10 && (
                <div className="text-xs text-red-400 text-center py-1">
                  ... and {syntaxErrors.length - 10} more errors
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d30] border-b border-[#3e3e3e]">
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <span>📁</span>
          <span className="font-medium">{file.name}</span>
          <span className="text-gray-500">({language})</span>
          {saveStatus === "unsaved" && <span className="text-yellow-400" title="Archivo modificado">●</span>}
          {saveStatus === "saving" && <span className="text-blue-400" title="Guardando...">💾</span>}
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
              onClick={(e) => {
                // Manejar Ctrl+Click para ir a definición en todos los lenguajes
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  const textarea = e.currentTarget;
                  const position = textarea.selectionStart;
                  goToDefinition(position);
                }
              }}
              onMouseOver={handleMouseOver}
              onMouseOut={handleMouseOut}
              onKeyDown={(e) => {
                // Auto-indentación al presionar Enter
                if (e.key === 'Enter') {
                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;

                  // Obtener la línea actual
                  const beforeCursor = content.substring(0, start);
                  const afterCursor = content.substring(end);
                  const currentLineStart = beforeCursor.lastIndexOf('\n') + 1;
                  const currentLine = beforeCursor.substring(currentLineStart);

                  // Detectar la indentación de la línea actual
                  const indentMatch = currentLine.match(/^(\s*)/);
                  const currentIndent = indentMatch ? indentMatch[1] : '';

                  // Verificar si la línea termina con un carácter que requiere indentación adicional
                  const lastChar = beforeCursor.trim().slice(-1);
                  const shouldIncreaseIndent = lastChar === '{' || lastChar === '[' || lastChar === '(' || lastChar === ':';

                  // Verificar si el siguiente carácter es un cierre
                  const nextChar = afterCursor.trim().charAt(0);
                  const isClosingChar = nextChar === '}' || nextChar === ']' || nextChar === ')';

                  e.preventDefault();

                  let newContent;
                  let newCursorPos;

                  if (shouldIncreaseIndent && isClosingChar) {
                    // Si tenemos apertura y cierre, crear dos líneas con indentación correcta
                    const extraIndent = '  '; // 2 espacios
                    const newLine1 = '\n' + currentIndent + extraIndent;
                    const newLine2 = '\n' + currentIndent;
                    newContent = beforeCursor + newLine1 + newLine2 + afterCursor;
                    newCursorPos = start + newLine1.length;
                  } else if (shouldIncreaseIndent) {
                    // Solo apertura, aumentar indentación
                    const extraIndent = '  '; // 2 espacios
                    const newLine = '\n' + currentIndent + extraIndent;
                    newContent = beforeCursor + newLine + afterCursor;
                    newCursorPos = start + newLine.length;
                  } else {
                    // Mantener la misma indentación
                    const newLine = '\n' + currentIndent;
                    newContent = beforeCursor + newLine + afterCursor;
                    newCursorPos = start + newLine.length;
                  }

                  handleContentChange(newContent, true);
                  setTimeout(() => {
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                  }, 0);
                  return;
                }

                // Autocierre de caracteres
                const closingChars: Record<string, string> = {
                  '(': ')',
                  '[': ']',
                  '{': '}',
                  '"': '"',
                  "'": "'",
                  '`': '`'
                };

                if (closingChars[e.key]) {
                  const textarea = e.currentTarget;
                  const start = textarea.selectionStart;
                  const end = textarea.selectionEnd;
                  const charAfter = content.charAt(start);

                  // Para comillas, solo auto-cerrar si no hay ya una comilla del mismo tipo después
                  if ((e.key === '"' || e.key === "'" || e.key === '`') && charAfter === e.key) {
                    // Si el carácter siguiente es la misma comilla, simplemente mover el cursor
                    e.preventDefault();
                    setTimeout(() => {
                      textarea.setSelectionRange(start + 1, start + 1);
                    }, 0);
                    return;
                  }

                  // Auto-cerrar el carácter
                  e.preventDefault();
                  const closingChar = closingChars[e.key];

                  if (start !== end) {
                    // Si hay selección, envolver la selección
                    const selectedText = content.substring(start, end);
                    const newContent = content.substring(0, start) + e.key + selectedText + closingChar + content.substring(end);
                    handleContentChange(newContent, true);
                    setTimeout(() => {
                      textarea.setSelectionRange(start + 1, end + 1);
                    }, 0);
                  } else {
                    // Si no hay selección, insertar el par
                    const newContent = content.substring(0, start) + e.key + closingChar + content.substring(end);
                    handleContentChange(newContent, true);
                    setTimeout(() => {
                      textarea.setSelectionRange(start + 1, start + 1);
                    }, 0);
                  }
                  return;
                }

                // Si se presiona un carácter de cierre y ya está presente, simplemente mover el cursor
                if ((e.key === ')' || e.key === ']' || e.key === '}') && content.charAt(textarea.selectionStart) === e.key) {
                  e.preventDefault();
                  const start = textarea.selectionStart;
                  setTimeout(() => {
                    textarea.setSelectionRange(start + 1, start + 1);
                  }, 0);
                  return;
                }

                // Manejar navegación del autocompletado
                if (showAutocomplete) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedSuggestionIndex(prev =>
                      prev < autocompleteSuggestions.length - 1 ? prev + 1 : 0
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedSuggestionIndex(prev =>
                      prev > 0 ? prev - 1 : autocompleteSuggestions.length - 1
                    );
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    if (autocompleteSuggestions[selectedSuggestionIndex]) {
                      selectSuggestion(autocompleteSuggestions[selectedSuggestionIndex]);
                    }
                  }
                }
              }}
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

      {/* TypeScript Autocomplete */}
      <TypeScriptAutocomplete
        suggestions={autocompleteSuggestions}
        isVisible={showAutocomplete}
        position={autocompletePosition}
        onSelect={selectSuggestion}
        onClose={hideAutocomplete}
        selectedIndex={selectedSuggestionIndex}
        onSelectIndex={setSelectedSuggestionIndex}
      />

      {/* TypeScript Signature Help */}
      <TypeScriptSignatureHelp
        signatureHelp={signatureHelpInfo}
        isVisible={showSignatureHelp}
        position={signatureHelpPosition}
        onClose={hideTypeScriptSignatureHelp}
      />

      {/* TypeScript Quick Fixes */}
      <TypeScriptQuickFixes
        fixes={quickFixes}
        isVisible={showQuickFixes}
        position={quickFixesPosition}
        onClose={hideTypeScriptQuickFixes}
        onApplyFix={applyQuickFix}
      />

      {/* Panel de Errores TypeScript */}
      {typescriptErrors.length > 0 && (
        <div className="fixed top-0 right-0 z-40 bg-red-900/90 border-l border-b border-red-700 rounded-bl-lg max-w-md max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between p-2 border-b border-red-700">
            <span className="text-red-200 text-sm font-medium">
              TypeScript Errors ({typescriptErrors.length})
            </span>
            <button
              onClick={toggleErrorPanel}
              className="text-red-400 hover:text-red-200 text-sm"
            >
              {showErrorPanel ? '▲' : '▼'}
            </button>
          </div>
          {showErrorPanel && (
            <div className="p-2 space-y-1">
              {typescriptErrors.slice(0, 10).map((error, index) => (
                <div key={index} className="text-xs text-red-200 bg-red-800/50 rounded p-2">
                  <div className="font-medium">Line {error.line + 1}: {error.message}</div>
                  {error.code && <div className="text-red-400 mt-1">TS{error.code}</div>}
                </div>
              ))}
              {typescriptErrors.length > 10 && (
                <div className="text-xs text-red-400 text-center py-1">
                  ... and {typescriptErrors.length - 10} more errors
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Funciones auxiliares para IA hover
function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'java': return 'java';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c++': return 'cpp';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'json': return 'json';
    default: return 'text';
  }
}

function getLineFromPosition(content: string, position: number): number {
  const lines = content.substring(0, position).split('\n');
  return lines.length - 1;
}

function getColumnFromPosition(content: string, position: number): number {
  const lines = content.substring(0, position).split('\n');
  return lines[lines.length - 1].length;
}

function extractSymbolAtPosition(line: string, column: number): string {
  // Extraer símbolo bajo el cursor (palabra completa)
  const before = line.substring(0, column);
  const after = line.substring(column);
  
  // Encontrar límites de la palabra
  const wordStart = before.replace(/[^\w$]/g, ' ').split(' ').pop() || '';
  const wordEnd = after.replace(/[^\w$]/g, ' ').split(' ')[0] || '';
  
  return wordStart + wordEnd;
}

function getCodeContext(content: string, position: number, contextLines: number = 3): string {
  const lines = content.split('\n');
  const currentLine = getLineFromPosition(content, position);

  // Si el archivo tiene más de 1000 líneas, usar solo 3 líneas de contexto
  // Si tiene menos, usar 100 líneas antes y después
  const isLargeFile = lines.length > 1000;
  const effectiveContextLines = isLargeFile ? contextLines : 100;

  const startLine = Math.max(0, currentLine - effectiveContextLines);
  const endLine = Math.min(lines.length - 1, currentLine + effectiveContextLines);

  return lines.slice(startLine, endLine + 1).join('\n');
}

export default EditorContent;