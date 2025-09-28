"use client"

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { Book, BookOpen } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import type { FileItem } from "./flutter-editor"
import { fileDiffService } from "../lib/file-diff"

interface EditorContentProps {
  file?: FileItem
  onContentChange: (content: string) => void
  files: Record<string, FileItem>
  onCreateFile: (filePath: string, content: string) => void
  onLoadFileContent?: (filePath: string) => Promise<string>
  editorSettings?: {
    lineNumbers: boolean
    syntaxHighlighting: boolean
    wordWrap: boolean
    autoResponses: boolean
    codeSuggestions: boolean
  }
}

const getLanguageFromExtension = (filename: string): string => {
  const extension = filename.split(".").pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    // Web Technologies
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    vue: "vue",
    svelte: "svelte",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    sass: "sass",
    less: "less",
    
    // Backend Languages
    py: "python",
    pyw: "python",
    go: "go",
    rs: "rust",
    rb: "ruby",
    php: "php",
    java: "java",
    kt: "kotlin",
    scala: "scala",
    cs: "csharp",
    fs: "fsharp",
    vb: "vbnet",
    
    // Systems Programming
    c: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    h: "c",
    hpp: "cpp",
    asm: "assembly",
    s: "assembly",
    
    // Functional Languages
    hs: "haskell",
    elm: "elm",
    ex: "elixir",
    exs: "elixir",
    clj: "clojure",
    cljs: "clojure",
    ml: "ocaml",
    
    // Data & Config
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    toml: "toml",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    
    // Database
    sql: "sql",
    
    // Scripting
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    fish: "bash",
    ps1: "powershell",
    psm1: "powershell",
    lua: "lua",
    
    // Mobile
    dart: "dart",
    swift: "swift",
    m: "objectivec",
    mm: "objectivec",
    
    // Documentation
    md: "markdown",
    markdown: "markdown",
    rst: "rst",
    tex: "latex",
    
    // Other
    r: "r",
    jl: "julia",
    nim: "nim",
    zig: "zig",
    v: "vlang",
    cr: "crystal",
    d: "dlang",
  }
  return languageMap[extension || ""] || "text"
}

// Optimized syntax highlighting with memoization
const highlightSyntax = (code: string, language: string): string => {
  if (language === "text" || !code) return code

  // Limit highlighting for very large files to improve performance
  if (code.length > 50000) {
    return code // Skip highlighting for very large files
  }

  // First escape HTML characters
  let highlighted = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Helper function to create string patterns for escaped HTML
  const createStringPatterns = () => [
    { regex: /(&quot;)(?:(?!&quot;)[^\\]|\\.)*(&quot;)/g, className: "text-yellow-300" },
    { regex: /(&#39;)(?:(?!&#39;)[^\\]|\\.)*(\&#39;)/g, className: "text-yellow-300" },
    { regex: /(`)[^`]*(`)/g, className: "text-yellow-300" },
  ]

  const patterns: Record<string, Array<{ regex: RegExp; className: string }>> = {
    javascript: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      {
        regex: /\b(function|const|let|var|if|else|for|while|return|class|extends|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|static|public|private|protected)\b/g,
        className: "text-blue-400",
      },
      { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    typescript: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      {
        regex: /\b(function|const|let|var|if|else|for|while|return|class|extends|import|export|from|default|async|await|try|catch|finally|throw|new|this|super|static|public|private|protected|interface|type|enum|namespace|declare|readonly|keyof|typeof)\b/g,
        className: "text-blue-400",
      },
      {
        regex: /\b(true|false|null|undefined|NaN|Infinity|string|number|boolean|object|any|void|never)\b/g,
        className: "text-purple-400",
      },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    python: [
      { regex: /#.*$/gm, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /("""|\'\'\')[\s\S]*?\1/g, className: "text-yellow-300" },
      {
        regex: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|lambda|yield|global|nonlocal|assert|break|continue|pass|and|or|not|in|is)\b/g,
        className: "text-blue-400",
      },
      { regex: /\b(True|False|None|self|cls)\b/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    css: [
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /[.#][\w-]+/g, className: "text-blue-400" },
      { regex: /\b\d+\.?\d*(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch|vmin|vmax|fr)\b/g, className: "text-orange-400" },
    ],
    html: [
      { regex: /&lt;!--[\s\S]*?--&gt;/g, className: "text-green-400" },
      { regex: /&lt;\/?[\w\s=&quot;&#39;/.':;#-\/\?]+&gt;/g, className: "text-blue-400" },
      ...createStringPatterns(),
    ],

    svelte: [
      { regex: /<!--[\s\S]*?-->/g, className: "text-green-400" },
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^>]*)?\/?>/g, className: "text-blue-400" },
      { regex: /\s([a-zA-Z-:]+)=/g, className: "text-yellow-400" },
      { regex: /\{[^}]*\}/g, className: "text-pink-400" },
      ...createStringPatterns(),
      { regex: /\b(export|default|import|from|const|let|var|function|if|else|for|while|return|async|await|onMount|onDestroy|createEventDispatcher)\b/g, className: "text-blue-400" },
    ],
    scss: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /\$[\w-]+/g, className: "text-purple-400" },
      { regex: /@[\w-]+/g, className: "text-cyan-400" },
      { regex: /[.#&][\w-]+/g, className: "text-blue-400" },
      ...createStringPatterns(),
      { regex: /\b\d+\.?\d*(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch|vmin|vmax|fr)\b/g, className: "text-orange-400" },
    ],
    sass: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /\$[\w-]+/g, className: "text-purple-400" },
      { regex: /@[\w-]+/g, className: "text-cyan-400" },
      { regex: /[.#&][\w-]+/g, className: "text-blue-400" },
      ...createStringPatterns(),
      { regex: /\b\d+\.?\d*(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch|vmin|vmax|fr)\b/g, className: "text-orange-400" },
    ],
    less: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /@[\w-]+/g, className: "text-purple-400" },
      { regex: /[.#&][\w-]+/g, className: "text-blue-400" },
      ...createStringPatterns(),
      { regex: /\b\d+\.?\d*(px|em|rem|%|vh|vw|pt|pc|in|cm|mm|ex|ch|vmin|vmax|fr)\b/g, className: "text-orange-400" },
    ],
    
    // Backend Languages
    go: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(package|import|func|var|const|type|struct|interface|if|else|for|range|switch|case|default|return|go|defer|chan|select|break|continue|fallthrough|goto)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|nil|iota)\b/g, className: "text-purple-400" },
      { regex: /\b(int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|byte|rune|string|bool|error)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    rust: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(fn|let|mut|const|static|struct|enum|impl|trait|for|in|while|loop|if|else|match|return|break|continue|mod|pub|use|crate|super|self|where|unsafe|async|await|move)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|None|Some|Ok|Err|Self)\b/g, className: "text-purple-400" },
      { regex: /\b(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    ruby: [
      { regex: /#.*$/gm, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(def|class|module|if|elsif|else|unless|case|when|for|in|while|until|do|end|return|yield|break|next|redo|retry|rescue|ensure|raise|begin|super|self|nil|true|false|and|or|not)\b/g, className: "text-blue-400" },
      { regex: /@[\w_]+/g, className: "text-purple-400" },
      { regex: /@@[\w_]+/g, className: "text-purple-400" },
      { regex: /\$[\w_]+/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    kotlin: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(fun|val|var|class|object|interface|enum|if|else|when|for|while|do|return|break|continue|try|catch|finally|throw|package|import|public|private|protected|internal|open|final|abstract|override|companion|data|sealed)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|null|this|super)\b/g, className: "text-purple-400" },
      { regex: /\b(Int|Long|Short|Byte|Double|Float|Boolean|Char|String|Unit|Any|Nothing)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    scala: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(def|val|var|class|object|trait|case|if|else|match|for|while|do|return|yield|try|catch|finally|throw|package|import|extends|with|override|abstract|final|sealed|implicit|lazy)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|null|this|super|None|Some|Nil)\b/g, className: "text-purple-400" },
      { regex: /\b(Int|Long|Short|Byte|Double|Float|Boolean|Char|String|Unit|Any|Nothing|List|Array|Map|Set|Option)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    fsharp: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\(\*[\s\S]*?\*\)/g, className: "text-green-400" },
      ...createStringPatterns(),
      { regex: /\b(let|and|rec|in|fun|function|match|with|if|then|else|elif|for|to|downto|while|do|done|try|finally|exception|raise|type|module|open|namespace|struct|sig|end|begin|when|as|upcast|downcast|null|base|inherit|abstract|default|override|interface|delegate|member|static|inline|mutable|public|private|internal)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|null|ignore|failwith|printf|printfn)\b/g, className: "text-purple-400" },
      { regex: /\b(int|float|string|bool|char|byte|sbyte|int16|uint16|int32|uint32|int64|uint64|decimal|unit|obj|list|array|seq|option)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    // Data Formats
    json: [
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1(?=\s*:)/g, className: "text-blue-400" }, // Keys
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1(?!\s*:)/g, className: "text-yellow-300" }, // String values
      { regex: /\b(true|false|null)\b/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    yaml: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /^[\s]*[\w-]+(?=:)/gm, className: "text-blue-400" }, // Keys
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(true|false|null|yes|no|on|off)\b/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
      { regex: /^[\s]*-/gm, className: "text-cyan-400" }, // List items
    ],
    jsx: [
      // Comments
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      
      // JSX Elements and Tags (adjusted for HTML-escaped content)
      { regex: /&lt;\/?[A-Z][a-zA-Z0-9]*(?:\s[^&gt;]*)?\/?&gt;/g, className: "text-cyan-400" }, // React components
      { regex: /&lt;\/?[a-z][a-zA-Z0-9-]*(?:\s[^&gt;]*)?\/?&gt;/g, className: "text-blue-400" }, // HTML elements
      { regex: /&lt;&gt;|&lt;\/&gt;/g, className: "text-blue-400" }, // React fragments
      
      // JSX Props and attributes
      { regex: /\s([a-zA-Z-]+)=/g, className: "text-yellow-400" }, // Attribute names
      { regex: /\{[^}]*\}/g, className: "text-pink-400" }, // JSX expressions
      
      // Strings (using helper function)
      ...createStringPatterns(),
      
      // JavaScript keywords
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|new|this|super|class|extends|import|export|from|as|async|await|yield|typeof|instanceof|in|of|delete|void|null|undefined|true|false)\b/g, className: "text-purple-400" },
      
      // Numbers (excluding those in CSS class names)
      { regex: /(?<!class=["'][^"']*)\b\d+\.?\d*\b(?![^"']*["'])/g, className: "text-orange-400" },
      
      // Functions
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, className: "text-blue-300" },
    ],
    tsx: [
      // Comments
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      
      // JSX Elements and Tags (adjusted for HTML-escaped content)
      { regex: /&lt;\/?[A-Z][a-zA-Z0-9]*(?:\s[^&gt;]*)?\/?&gt;/g, className: "text-cyan-400" }, // React components
      { regex: /&lt;\/?[a-z][a-zA-Z0-9-]*(?:\s[^&gt;]*)?\/?&gt;/g, className: "text-blue-400" }, // HTML elements
      { regex: /&lt;&gt;|&lt;\/&gt;/g, className: "text-blue-400" }, // React fragments
      
      // JSX Props and attributes
      { regex: /\s([a-zA-Z-]+)=/g, className: "text-yellow-400" }, // Attribute names
      { regex: /\{[^}]*\}/g, className: "text-pink-400" }, // JSX expressions
      
      // Strings (using helper function)
      ...createStringPatterns(),
      
      // TypeScript keywords - split into smaller groups for better performance
      { regex: /\b(const|let|var|function|return|if|else|for|while|do|break|continue)\b/g, className: "text-purple-400" },
      { regex: /\b(switch|case|default|try|catch|finally|throw|new|this|super|class|extends)\b/g, className: "text-purple-400" },
      { regex: /\b(import|export|from|as|async|await|yield|typeof|instanceof|in|of|delete)\b/g, className: "text-purple-400" },
      { regex: /\b(void|null|undefined|true|false|interface|type|enum|namespace|declare)\b/g, className: "text-purple-400" },
      { regex: /\b(readonly|keyof|satisfies)\b/g, className: "text-purple-400" },
      
      // TypeScript types
      { regex: /\b(string|number|boolean|object|any|void|never|unknown|bigint|symbol)\b/g, className: "text-cyan-400" },
      
      // Numbers (excluding those in CSS class names)
      { regex: /(?<!class=["'][^"']*)\b\d+\.?\d*\b(?![^"']*["'])/g, className: "text-orange-400" },
      
      // Functions
      { regex: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, className: "text-blue-300" },
    ],
    
    // Web Framework Languages
    vue: [
      { regex: /<!--[\s\S]*?-->/g, className: "text-green-400" },
      { regex: /<\?[\s\S]*?\?>/g, className: "text-purple-400" },
      { regex: /<\/?[\w\s="/.':;#-\/\?]+>/g, className: "text-blue-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
    ],
    toml: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /^\s*\[.*\]$/gm, className: "text-cyan-400" }, // Sections
      { regex: /^[\s]*[\w-]+(?=\s*=)/gm, className: "text-blue-400" }, // Keys
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(true|false)\b/g, className: "text-purple-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    ini: [
      { regex: /[;#].*$/gm, className: "text-green-400" },
      { regex: /^\s*\[.*\]$/gm, className: "text-cyan-400" }, // Sections
      { regex: /^[\s]*[\w-]+(?=\s*=)/gm, className: "text-blue-400" }, // Keys
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
    ],
    sql: [
      { regex: /--.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(SELECT|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|ON|GROUP|BY|ORDER|HAVING|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DATABASE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|ALTER|DROP|TRUNCATE|UNION|ALL|DISTINCT|AS|AND|OR|NOT|NULL|IS|IN|BETWEEN|LIKE|EXISTS|CASE|WHEN|THEN|ELSE|END|IF|WHILE|FOR|DECLARE|BEGIN|COMMIT|ROLLBACK|TRANSACTION)\b/gi, className: "text-blue-400" },
      { regex: /\b(INT|INTEGER|VARCHAR|CHAR|TEXT|DATE|DATETIME|TIMESTAMP|DECIMAL|FLOAT|DOUBLE|BOOLEAN|BOOL|BINARY|BLOB|JSON)\b/gi, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    // Scripting Languages
    bash: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\$[\w_]+/g, className: "text-purple-400" },
      { regex: /\$\{[^}]+\}/g, className: "text-purple-400" },
      { regex: /\b(if|then|else|elif|fi|for|in|do|done|while|until|case|esac|function|return|exit|break|continue|local|export|readonly|declare|unset|shift|eval|exec|source|alias|unalias|history|jobs|bg|fg|nohup|disown|kill|killall|ps|top|grep|sed|awk|cut|sort|uniq|head|tail|wc|find|xargs|tar|gzip|gunzip|zip|unzip|curl|wget|ssh|scp|rsync|chmod|chown|chgrp|ls|cd|pwd|mkdir|rmdir|rm|cp|mv|ln|cat|less|more|echo|printf|read|test)\b/g, className: "text-blue-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    powershell: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /<#[\s\S]*?#>/g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\$[\w_:]+/g, className: "text-purple-400" },
      { regex: /\b(if|elseif|else|switch|for|foreach|while|do|until|break|continue|return|function|filter|workflow|class|enum|try|catch|finally|throw|param|begin|process|end|pipeline|parallel|sequence|inlinescript)\b/gi, className: "text-blue-400" },
      { regex: /\b(Get-|Set-|New-|Remove-|Add-|Clear-|Copy-|Move-|Rename-|Test-|Start-|Stop-|Restart-|Enable-|Disable-|Import-|Export-|Select-|Where-|Sort-|Group-|Measure-|Compare-|ForEach-|Out-|Write-|Read-)\w*/gi, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    lua: [
      { regex: /--.*$/gm, className: "text-green-400" },
      { regex: /--\[\[[\s\S]*?\]\]/g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b/g, className: "text-blue-400" },
      { regex: /\b(print|type|tostring|tonumber|pairs|ipairs|next|getmetatable|setmetatable|rawget|rawset|rawequal|rawlen|select|unpack|require|module|package|string|table|math|io|os|debug|coroutine)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    // Mobile Languages
    swift: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(class|struct|enum|protocol|extension|func|var|let|if|else|guard|switch|case|default|for|in|while|repeat|break|continue|return|throw|throws|rethrows|try|catch|defer|import|public|private|internal|fileprivate|open|final|static|lazy|weak|unowned|mutating|nonmutating|override|required|convenience|dynamic|inout|associatedtype|typealias|subscript|willSet|didSet|get|set|init|deinit|self|super|Self|where|as|is)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|nil)\b/g, className: "text-purple-400" },
      { regex: /\b(Int|Double|Float|String|Bool|Character|Array|Dictionary|Set|Optional|Any|AnyObject|Void)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    objectivec: [
      { regex: /\/\/.*$/gm, className: "text-green-400" },
      { regex: /\/\*[\s\S]*?\*\//g, className: "text-green-400" },
      { regex: /@"[^"]*"/g, className: "text-yellow-300" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(@interface|@implementation|@protocol|@property|@synthesize|@dynamic|@class|@selector|@encode|@synchronized|@autoreleasepool|@try|@catch|@finally|@throw|if|else|for|while|do|switch|case|default|break|continue|return|typedef|struct|enum|union|const|static|extern|inline|register|volatile|restrict|auto|signed|unsigned|short|long|int|char|float|double|void)\b/g, className: "text-blue-400" },
      { regex: /\b(YES|NO|nil|NULL|TRUE|FALSE|self|super)\b/g, className: "text-purple-400" },
      { regex: /\b(NSString|NSArray|NSDictionary|NSSet|NSNumber|NSData|NSDate|NSURL|NSError|UIView|UIViewController|UILabel|UIButton|UIImageView|UITableView|UICollectionView)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    // Functional Languages
    haskell: [
      { regex: /--.*$/gm, className: "text-green-400" },
      { regex: /\{-[\s\S]*?-\}/g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(module|import|qualified|as|hiding|where|let|in|case|of|if|then|else|do|class|instance|data|newtype|type|deriving|infixl|infixr|infix)\b/g, className: "text-blue-400" },
      { regex: /\b(True|False|Nothing|Just|Left|Right|LT|EQ|GT|otherwise)\b/g, className: "text-purple-400" },
      { regex: /\b(Int|Integer|Float|Double|Char|String|Bool|Maybe|Either|IO|Monad|Functor|Applicative|Foldable|Traversable)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    elixir: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(def|defp|defmodule|defprotocol|defimpl|defstruct|defexception|defmacro|defmacrop|defguard|defguardp|if|unless|cond|case|with|for|try|rescue|catch|after|raise|throw|receive|send|spawn|spawn_link|spawn_monitor|import|alias|require|use|quote|unquote|when|and|or|not|in|fn|end|do|else|elsif)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|nil|self)\b/g, className: "text-purple-400" },
      { regex: /:[\w_]+/g, className: "text-cyan-400" }, // Atoms
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    clojure: [
      { regex: /;.*$/gm, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(def|defn|defn-|defmacro|defmulti|defmethod|defprotocol|defrecord|defstruct|deftype|let|if|when|when-not|cond|condp|case|and|or|not|do|loop|recur|fn|quote|syntax-quote|unquote|unquote-splicing|var|throw|try|catch|finally|monitor-enter|monitor-exit|new|set!|ns|in-ns|import|use|require|refer|load|eval|apply|partial|comp|complement|constantly|identity|fnil|memoize|trampoline|repeatedly|iterate|cycle|range|take|drop|filter|map|reduce|into|conj|assoc|dissoc|get|get-in|assoc-in|update-in|select-keys|merge|merge-with|zipmap|group-by|partition|partition-by|split-at|split-with|frequencies|distinct|sort|sort-by|reverse|shuffle|first|second|last|rest|next|butlast|take-last|drop-last|take-while|drop-while|some|every?|not-any?|not-every?|empty?|seq|vec|list|set|hash-map|hash-set|vector|list*|lazy-seq|repeatedly|iterate|cycle|range|repeat|replicate|take|drop|take-nth|take-while|drop-while|filter|remove|keep|keep-indexed|map|map-indexed|mapcat|for|doseq|dotimes|while|when|when-not|when-let|when-first|if-let|if-not|cond|condp|case|and|or|not|some->|some->>|as->|cond->|cond->>|doto|->|->>) /g, className: "text-blue-400" },
      { regex: /\b(true|false|nil)\b/g, className: "text-purple-400" },
      { regex: /:[a-zA-Z][a-zA-Z0-9*+!_?-]*/g, className: "text-cyan-400" }, // Keywords
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    // Other Languages
    r: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(function|if|else|for|in|while|repeat|next|break|return|switch|ifelse|stop|warning|try|tryCatch|library|require|source|attach|detach|with|within|data|list|vector|matrix|array|factor|data.frame|NULL|NA|TRUE|FALSE|Inf|NaN)\b/g, className: "text-blue-400" },
      { regex: /\b(c|length|dim|names|colnames|rownames|str|summary|head|tail|class|typeof|is|as|print|cat|paste|sprintf|substr|nchar|grep|gsub|sub|strsplit|toupper|tolower|mean|median|sd|var|min|max|sum|prod|range|quantile|sort|order|rank|unique|duplicated|which|match|%in%|apply|lapply|sapply|mapply|tapply|aggregate|merge|rbind|cbind|t|solve|eigen|svd|qr|chol|det|diag|crossprod|tcrossprod)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    julia: [
      { regex: /#.*$/gm, className: "text-green-400" },
      { regex: /#=[\s\S]*?=#/g, className: "text-green-400" },
      { regex: /(['"])(?:(?!\1)[^\\]|\\.)*\1/g, className: "text-yellow-300" },
      { regex: /\b(function|end|if|elseif|else|for|in|while|do|break|continue|return|try|catch|finally|throw|rethrow|let|local|global|const|struct|mutable|abstract|primitive|type|where|module|using|import|export|macro|quote|baremodule)\b/g, className: "text-blue-400" },
      { regex: /\b(true|false|nothing|missing|undef|Inf|NaN)\b/g, className: "text-purple-400" },
      { regex: /\b(Int|Int8|Int16|Int32|Int64|UInt|UInt8|UInt16|UInt32|UInt64|Float16|Float32|Float64|Complex|ComplexF32|ComplexF64|Bool|Char|String|Symbol|Array|Vector|Matrix|Dict|Set|Tuple|NamedTuple|Union|Any|Nothing|Missing)\b/g, className: "text-cyan-400" },
      { regex: /\b\d+\.?\d*\b/g, className: "text-orange-400" },
    ],
    
    markdown: [
      { regex: /^#{1,6}\s.+$/gm, className: "text-white font-bold text-xl" },
      { regex: /\*\*(.+?)\*\*/g, className: "text-white font-bold" },
      { regex: /\*(.+?)\*/g, className: "text-white italic" },
      { regex: /`(.+?)`/g, className: "text-green-300 bg-gray-800 px-1 rounded" },
      { regex: /\[(.+?)\]\(.+?\)/g, className: "text-blue-300 underline" },
      { regex: /^.+$/gm, className: "text-white" }, // Default text color for all lines
    ],
  }

  const languagePatterns = patterns[language] || []

  // Apply patterns in order, being careful not to interfere with already highlighted text
  languagePatterns.forEach(({ regex, className }) => {
    highlighted = highlighted.replace(regex, (match, ...groups) => {
      // Don't highlight text that's already inside a span tag or contains HTML entities
      const beforeMatch = highlighted.substring(0, highlighted.indexOf(match))
      const afterMatch = highlighted.substring(highlighted.indexOf(match) + match.length)
      
      // Check if this match is already inside a span tag
      const lastOpenSpan = beforeMatch.lastIndexOf('<span')
      const lastCloseSpan = beforeMatch.lastIndexOf('</span>')
      const isInsideSpan = lastOpenSpan > lastCloseSpan
      
      // Check if this match contains or is part of HTML attributes
      const containsClassAttribute = match.includes('class=') || match.includes('text-') || match.includes('-400') || match.includes('-300')
      
      if (isInsideSpan || containsClassAttribute) {
        return match // Don't modify if already highlighted or contains CSS classes
      }
      
      return `<span class="${className}">${match}</span>`
    })
  })

  return highlighted
}

export function EditorContent({ file, onContentChange, files, onCreateFile, onLoadFileContent, editorSettings }: EditorContentProps) {
  const [content, setContent] = useState(file?.content || "")
  const [selectedText, setSelectedText] = useState("")
  const [selectionStart, setSelectionStart] = useState(0)
  const [selectionEnd, setSelectionEnd] = useState(0)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [scrollTop, setScrollTop] = useState(0)
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit")
  
  // Undo/Redo history state
  const [history, setHistory] = useState<string[]>([file?.content || ""])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [isUndoRedo, setIsUndoRedo] = useState(false)
  
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Default settings
  const settings = editorSettings || {
    lineNumbers: true,
    syntaxHighlighting: true,
    wordWrap: false,
    autoResponses: true,
    codeSuggestions: true,
  }

  const fileName = file?.name ?? ""
  const filePath = file?.path ?? ""

  // Memoized values for performance
  const language = useMemo(() => {
    return fileName ? getLanguageFromExtension(fileName) : "text"
  }, [fileName])

  const isMarkdown = useMemo(() => {
    if (!fileName) return false
    const extension = fileName.split(".").pop()?.toLowerCase()
    return extension === "md" || extension === "markdown"
  }, [fileName])

  useEffect(() => {
    setViewMode("edit")
  }, [filePath])

  const markdownComponents = useMemo<Components>(() => ({
    h1: (props) => <h1 {...props} />,
    h2: (props) => <h2 {...props} />,
    h3: (props) => <h3 {...props} />,
    p: (props) => <p {...props} />,
    ul: (props) => <ul {...props} />,
    ol: (props) => <ol {...props} />,
    li: (props) => <li {...props} />,
    blockquote: (props) => <blockquote {...props} />,
    code: ({ inline, className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) => {
    if (inline) {
      return <code className="inline-block" {...props}>{children}</code>;
    }

      return (
        <pre>
          <code {...props}>
            {children}
          </code>
        </pre>
      );
    },
    table: (props) => (
      <div className="overflow-x-auto">
        <table {...props} />
      </div>
    ),
    thead: (props) => <thead {...props} />,
    th: (props) => <th {...props} />,
    td: (props) => <td {...props} />,
    a: (props) => (
      <a target="_blank" rel="noopener noreferrer" {...props} />
    ),
    img: ({ alt, ...props }) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt ?? ""} {...props} />
    ),
    hr: (props) => <hr {...props} />,
  }), [])

  const lines = useMemo(() => {
    return content.split('\n')
  }, [content])

  const lineCount = lines.length

  const showEditor = !(isMarkdown && viewMode === "preview")
  const showLineNumbers = settings.lineNumbers && showEditor
  const editorTextSizeClass = isMarkdown ? "text-base" : "text-sm"

  // Memoized highlighted content
  const highlightedContent = useMemo(() => {
    if (!settings.syntaxHighlighting || !content) return content
    return highlightSyntax(content, language)
  }, [content, language, settings.syntaxHighlighting])

  // Sync scroll between textarea and overlay
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    setScrollTop(scrollTop)
    if (overlayRef.current) {
      overlayRef.current.scrollTop = scrollTop
    }
  }, [])

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const previousContent = history[newIndex]
      setIsUndoRedo(true)
      setContent(previousContent)
      setHistoryIndex(newIndex)
      onContentChange(previousContent)
      setSaveStatus("unsaved")
    }
  }, [history, historyIndex, onContentChange])

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const nextContent = history[newIndex]
      setIsUndoRedo(true)
      setContent(nextContent)
      setHistoryIndex(newIndex)
      onContentChange(nextContent)
      setSaveStatus("unsaved")
    }
  }, [history, historyIndex, onContentChange])

  // Add to history function
  const addToHistory = useCallback((newContent: string) => {
    if (isUndoRedo) {
      setIsUndoRedo(false)
      return
    }
    
    // Don't add to history if content is the same
    if (history[historyIndex] === newContent) return
    
    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1)
    newHistory.push(newContent)
    
    // Limit history to 100 entries
    if (newHistory.length > 100) {
      newHistory.shift()
    } else {
      setHistoryIndex(historyIndex + 1)
    }
    
    setHistory(newHistory)
  }, [history, historyIndex, isUndoRedo])

  // Optimized content change handler with debouncing
  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent)
    onContentChange(newContent)
    setSaveStatus("unsaved")
    
    // Add to history with a small delay to avoid too many entries
    setTimeout(() => addToHistory(newContent), 500)
  }, [onContentChange, addToHistory])

  // Update content when file changes
  useEffect(() => {
    const newContent = file?.content || ""
    setContent(newContent)
    setSaveStatus("saved")
    // Reset history when switching files
    setHistory([newContent])
    setHistoryIndex(0)
    setIsUndoRedo(false)
  }, [file])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveFile()
      } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault()
        redo()
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault()
        undo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [file, undo, redo])

  const saveFile = async () => {
    if (!file) return
    
    setSaveStatus("saving")
    
    // Simulate save delay
    await new Promise(resolve => setTimeout(resolve, 200))
    
    setSaveStatus("saved")
    
    // Hide save status after 2 seconds
    setTimeout(() => {
      setSaveStatus("saved")
    }, 2000)
  }

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
          {isMarkdown && (
            <button
              onClick={() => setViewMode(viewMode === "edit" ? "preview" : "edit")}
              className={`flex items-center gap-1 rounded border border-transparent px-2 py-1 text-xs font-medium text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0e639c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2d2d30] disabled:opacity-50 ${viewMode === "preview" ? "bg-[#0e639c] hover:bg-[#1177bb]" : "bg-[#3a3d41] hover:bg-[#45494e]"}`}
              title={viewMode === "edit" ? "Ver previsualización" : "Volver a edición"}
            >
              {viewMode === "edit" ? <Book className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              <span>{viewMode === "edit" ? "Preview" : "Editar"}</span>
            </button>
          )}
          {saveStatus === "saving" && <span className="text-blue-400">Guardando...</span>}
          {saveStatus === "saved" && <span className="text-green-400">Guardado</span>}
          {saveStatus === "unsaved" && <span className="text-yellow-400">Sin guardar (Ctrl+S)</span>}
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Line Numbers */}
  {showLineNumbers && (
          <div className="bg-[#1e1e1e] text-[#858585] text-sm leading-6 px-3 py-4 select-none min-w-[60px] border-r border-[#3e3e3e] overflow-hidden">
            <div 
              className="overflow-hidden"
              style={{ 
                transform: `translateY(-${scrollTop}px)`,
                transition: 'none'
              }}
            >
              {lines.map((_, i) => (
                <div key={i + 1} className="text-right h-6 flex items-center justify-end">
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 relative overflow-hidden">
          {/* Syntax Highlighting Overlay */}
          {showEditor && settings.syntaxHighlighting && (
            <div
              ref={overlayRef}
              className={`absolute inset-0 p-4 leading-6 font-mono pointer-events-none overflow-auto scrollbar-hide text-white ${editorTextSizeClass} ${
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
              }}
              dangerouslySetInnerHTML={{
                __html: highlightedContent,
              }}
            />
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
              className={`w-full h-full bg-transparent ${settings.syntaxHighlighting ? 'text-transparent' : 'text-white'} caret-white ${editorTextSizeClass} leading-6 p-4 resize-none outline-none font-mono relative z-10 scrollbar-thin scrollbar-track-[#2d2d30] scrollbar-thumb-[#555]`}
              style={{
                minHeight: "100%",
                whiteSpace: settings.wordWrap ? "pre-wrap" : "pre",
                overflowWrap: settings.wordWrap ? "break-word" : "normal",
                wordBreak: settings.wordWrap ? "break-word" : "normal",
                tabSize: 2,
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
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
