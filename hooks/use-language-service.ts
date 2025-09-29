import { useState, useEffect, useCallback } from 'react'

// Add electronAPI type to Window interface for TypeScript
declare global {
  interface Window {
    electronAPI?: {
      getSuggestions?: (fileName: string, content: string, position: number) => Promise<any>;
      updateTsFile?: (fileName: string, content: string) => Promise<void>;
      getTsQuickInfo?: (fileName: string, position: number) => Promise<any>;
      getTsDefinition?: (fileName: string, position: number) => Promise<any>;
      getTsSignatureHelp?: (fileName: string, position: number) => Promise<any>;
      getTsDiagnostics?: (fileName: string) => Promise<any>;
    };
  }
}

export interface CompletionItem {
  label?: string
  name?: string
  kind: string
  detail?: string
  documentation?: string
  insertText?: string
  sortText?: string
}

export interface HoverInfo {
  contents: string
  range?: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface Definition {
  uri: string
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export interface SignatureHelp {
  signatures: Array<{
    label: string
    documentation?: string
    parameters: Array<{
      label: string
      documentation?: string
    }>
  }>
  activeSignature: number
  activeParameter: number
}

export interface Diagnostic {
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  source?: string
  code?: string
}

export interface LanguageService {
  getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]>
  getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null>
  getDefinition(fileName: string, content: string, position: number): Promise<Definition | null>
  getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null>
  getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]>
  updateFile(fileName: string, content: string): Promise<void>
}

// Language detection based on file extension
const getLanguageFromExtension = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': return 'javascript';
    case 'jsx': return 'javascript';
    case 'ts': return 'typescript';
    case 'tsx': return 'typescript';
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
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sh': return 'bash';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    default: return 'text';
  }
};

// Factory function to create language service based on language
const createLanguageService = (language: string): LanguageService => {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return createTypeScriptService();
    case 'python':
      return createPythonService();
    case 'go':
      return createGoService();
    case 'java':
      return createJavaService();
    case 'cpp':
      return createCppService();
    case 'html':
      return createHtmlService();
    case 'css':
      return createCssService();
    case 'json':
      return createJsonService();
    default:
      return createFallbackService();
  }
};

// TypeScript/JavaScript service (existing implementation)
const createTypeScriptService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      if (!window.electronAPI?.getSuggestions) return [];

      try {
        if (window.electronAPI?.updateTsFile) {
          if (window.electronAPI?.updateTsFile) {
            if (window.electronAPI?.updateTsFile) {
              if (window.electronAPI?.updateTsFile) {
                if (window.electronAPI?.updateTsFile) {
                  if (window.electronAPI?.updateTsFile) {
                    if (window.electronAPI?.updateTsFile) {
                      if (window.electronAPI?.updateTsFile) {
                        if (window.electronAPI?.updateTsFile) {
                          if (window.electronAPI?.updateTsFile) {
                            if (window.electronAPI?.updateTsFile) {
                              if (window.electronAPI?.updateTsFile) {
                                if (window.electronAPI?.updateTsFile) {
                                  if (window.electronAPI?.updateTsFile) {
                                    await window.electronAPI.updateTsFile(fileName, content);
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        const suggestions = await window.electronAPI.getSuggestions(fileName, content, position);
        return suggestions.map((s: any) => ({
          label: s.name || s.label,
          kind: s.kind || 'text',
          detail: s.kindModifiers,
          insertText: s.insertText || s.name,
          sortText: s.sortText
        }));
      } catch (error) {
        console.error('TypeScript completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      if (!window.electronAPI?.getTsQuickInfo) return null;

      try {
        if (window.electronAPI?.updateTsFile) {
          await window.electronAPI.updateTsFile(fileName, content);
        }
        const result = await window.electronAPI.getTsQuickInfo(fileName, position);
        if (result.success && result.quickInfo) {
          const quickInfo = result.quickInfo;
          let contents = '';
          if (quickInfo.displayParts) {
            contents = quickInfo.displayParts.map((part: any) => part.text).join('');
          }
          return { contents };
        }
        return null;
      } catch (error) {
        console.error('TypeScript hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      if (!window.electronAPI?.getTsDefinition) return null;

      try {
        if (window.electronAPI?.updateTsFile) {
          await window.electronAPI.updateTsFile(fileName, content);
        }
        const result = await window.electronAPI.getTsDefinition(fileName, position);
        if (result.success && result.definition) {
          const def = result.definition;
          return {
            uri: def.fileName,
            range: {
              start: { line: def.line, character: def.character },
              end: { line: def.line, character: def.character + (def.textSpan?.length || 0) }
            }
          };
        }
        return null;
      } catch (error) {
        console.error('TypeScript definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      if (!window.electronAPI?.getTsSignatureHelp) return null;

      try {
        if (window.electronAPI?.updateTsFile) {
          await window.electronAPI.updateTsFile(fileName, content);
        }
        const result = await window.electronAPI.getTsSignatureHelp(fileName, position);
        if (result.success && result.signatureHelp) {
          const sh = result.signatureHelp;
          return {
            signatures: sh.items?.map((item: any) => ({
              label: item.prefixDisplayParts?.map((p: any) => p.text).join('') +
                     item.parameters?.map((p: any) => p.displayParts?.map((dp: any) => dp.text).join('')).join(', ') +
                     item.suffixDisplayParts?.map((p: any) => p.text).join(''),
              parameters: item.parameters?.map((p: any) => ({
                label: p.displayParts?.map((dp: any) => dp.text).join(''),
                documentation: p.documentation?.map((d: any) => d.text).join('')
              })) || []
            })) || [],
            activeSignature: sh.selectedItemIndex || 0,
            activeParameter: sh.argumentIndex || 0
          };
        }
        return null;
      } catch (error) {
        console.error('TypeScript signature help error:', error);
        return null;
      }
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      if (!window.electronAPI?.getTsDiagnostics) return [];

      try {
        if (window.electronAPI?.updateTsFile) {
          await window.electronAPI.updateTsFile(fileName, content);
        }
        const result = await window.electronAPI.getTsDiagnostics(fileName);
        if (result.success) {
          return (result.errors || []).map((error: any) => ({
            range: {
              start: { line: error.line - 1, character: error.character || 0 },
              end: { line: error.line - 1, character: (error.character || 0) + (error.length || 0) }
            },
            severity: error.category === 1 ? 'error' : error.category === 2 ? 'warning' : 'info',
            message: error.message,
            source: 'typescript',
            code: error.code
          }));
        }
        return [];
      } catch (error) {
        console.error('TypeScript diagnostics error:', error);
        return [];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      if (window.electronAPI?.updateTsFile) {
        await window.electronAPI.updateTsFile(fileName, content);
      }
    }
  };
};

// Python service using Pyright
const createPythonService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/python/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('Python completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/python/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('Python hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/python/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('Python definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      try {
        const response = await fetch('/api/python/signature-help/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.signatureHelp || null;
      } catch (error) {
        console.error('Python signature help error:', error);
        return null;
      }
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      try {
        const response = await fetch('/api/pyright/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: content })
        });
        const result = await response.json();
        return (result.errors || []).map((error: any) => ({
          range: {
            start: { line: error.line || 0, character: error.character || 0 },
            end: { line: error.line || 0, character: (error.character || 0) + 1 }
          },
          severity: error.severity || 'error',
          message: error.message,
          source: error.source || 'pyright',
          code: error.code
        }));
      } catch (error) {
        console.error('Python diagnostics error:', error);
        return [];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // Python service doesn't need explicit file updates for basic functionality
    }
  };
};

// Go service using gopls
const createGoService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/go/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('Go completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/go/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('Go hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/go/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('Go definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      try {
        const response = await fetch('/api/go/signature-help/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.signatureHelp || null;
      } catch (error) {
        console.error('Go signature help error:', error);
        return null;
      }
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      try {
        const response = await fetch('/api/go/diagnostics/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content })
        });
        const result = await response.json();
        return result.diagnostics || [];
      } catch (error) {
        console.error('Go diagnostics error:', error);
        return [];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // Go service doesn't need explicit file updates for basic functionality
    }
  };
};

// C/C++ service using clangd
const createCppService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        interface CppCompletion {
          label?: string;
          name?: string;
          kind: string;
          detail?: string;
          documentation?: string;
          insertText?: string;
          sortText?: string;
        }

        interface CppCompletionsResponse {
          completions?: CppCompletion[];
        }

        const response: Response = await fetch('/api/cpp/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result: CppCompletionsResponse = await response.json();
        return result.completions || [];
      } catch (error: unknown) {
        console.error('C++ completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/cpp/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('C++ hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/cpp/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('C++ definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      try {
        const response = await fetch('/api/cpp/signature-help/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.signatureHelp || null;
      } catch (error) {
        console.error('C++ signature help error:', error);
        return null;
      }
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      try {
        const response = await fetch('/api/clangd/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: content, fileName })
        });
        const result = await response.json();
        return (result.errors || []).map((error: any) => ({
          range: {
            start: { line: error.line || 0, character: error.character || 0 },
            end: { line: error.line || 0, character: (error.character || 0) + 1 }
          },
          severity: error.severity || 'error',
          message: error.message,
          source: error.source || 'clangd',
          code: error.code
        }));
      } catch (error) {
        console.error('C++ diagnostics error:', error);
        return [];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // C++ service doesn't need explicit file updates for basic functionality
    }
  };
};

// Java service using JDT Language Server
const createJavaService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/java/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('Java completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/java/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('Java hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/java/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('Java definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      try {
        const response = await fetch('/api/java/signature-help/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.signatureHelp || null;
      } catch (error) {
        console.error('Java signature help error:', error);
        return null;
      }
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      try {
        const response = await fetch('/api/java/diagnostics/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content })
        });
        const result = await response.json();
        return result.diagnostics || [];
      } catch (error) {
        console.error('Java diagnostics error:', error);
        return [];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // Java service doesn't need explicit file updates for basic functionality
    }
  };
};

// HTML service
const createHtmlService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/html/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('HTML completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/html/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('HTML hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/html/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('HTML definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      return null; // HTML doesn't have signature help
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      // Basic HTML validation could be added here
      return [];
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // HTML service doesn't need explicit file updates
    }
  };
};

// CSS service
const createCssService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/css/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('CSS completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/css/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('CSS hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      try {
        const response = await fetch('/api/css/definition/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.definition || null;
      } catch (error) {
        console.error('CSS definition error:', error);
        return null;
      }
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      return null; // CSS doesn't have signature help
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      // Basic CSS validation could be added here
      return [];
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // CSS service doesn't need explicit file updates
    }
  };
};

// JSON service
const createJsonService = (): LanguageService => {
  return {
    async getCompletions(fileName: string, content: string, position: number): Promise<CompletionItem[]> {
      try {
        const response = await fetch('/api/json/completions/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.completions || [];
      } catch (error) {
        console.error('JSON completions error:', error);
        return [];
      }
    },

    async getHover(fileName: string, content: string, position: number): Promise<HoverInfo | null> {
      try {
        const response = await fetch('/api/json/hover/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, content, position })
        });
        const result = await response.json();
        return result.hover || null;
      } catch (error) {
        console.error('JSON hover error:', error);
        return null;
      }
    },

    async getDefinition(fileName: string, content: string, position: number): Promise<Definition | null> {
      return null; // JSON doesn't have definitions
    },

    async getSignatureHelp(fileName: string, content: string, position: number): Promise<SignatureHelp | null> {
      return null; // JSON doesn't have signature help
    },

    async getDiagnostics(fileName: string, content: string): Promise<Diagnostic[]> {
      try {
        // Basic JSON validation
        JSON.parse(content);
        return [];
      } catch (error: any) {
        return [{
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1000 }
          },
          severity: 'error',
          message: error.message,
          source: 'json'
        }];
      }
    },

    async updateFile(fileName: string, content: string): Promise<void> {
      // JSON service doesn't need explicit file updates
    }
  };
};

// Fallback service for unsupported languages
const createFallbackService = (): LanguageService => {
  return {
    async getCompletions(): Promise<CompletionItem[]> { return []; },
    async getHover(): Promise<HoverInfo | null> { return null; },
    async getDefinition(): Promise<Definition | null> { return null; },
    async getSignatureHelp(): Promise<SignatureHelp | null> { return null; },
    async getDiagnostics(): Promise<Diagnostic[]> { return []; },
    async updateFile(): Promise<void> {}
  };
};

export function useLanguageService(fileName?: string) {
  const [isElectron, setIsElectron] = useState(false);
  const [languageService, setLanguageService] = useState<LanguageService | null>(null);

  useEffect(() => {
    const checkElectron = () => {
      const electronDetected = typeof window !== 'undefined' &&
        (window as any).electronAPI !== undefined;
      setIsElectron(electronDetected);
    };
    checkElectron();
  }, []);

  useEffect(() => {
    if (fileName) {
      const language = getLanguageFromExtension(fileName);
      const service = createLanguageService(language);
      setLanguageService(service);
    } else {
      setLanguageService(null);
    }
  }, [fileName]);

  const getCompletions = useCallback(async (content: string, position: number): Promise<CompletionItem[]> => {
    if (!languageService || !fileName) return [];
    return languageService.getCompletions(fileName, content, position);
  }, [languageService, fileName]);

  const getHover = useCallback(async (content: string, position: number): Promise<HoverInfo | null> => {
    if (!languageService || !fileName) return null;
    return languageService.getHover(fileName, content, position);
  }, [languageService, fileName]);

  const getDefinition = useCallback(async (content: string, position: number): Promise<Definition | null> => {
    if (!languageService || !fileName) return null;
    return languageService.getDefinition(fileName, content, position);
  }, [languageService, fileName]);

  const getSignatureHelp = useCallback(async (content: string, position: number): Promise<SignatureHelp | null> => {
    if (!languageService || !fileName) return null;
    return languageService.getSignatureHelp(fileName, content, position);
  }, [languageService, fileName]);

  const getDiagnostics = useCallback(async (content: string): Promise<Diagnostic[]> => {
    if (!languageService || !fileName) return [];
    return languageService.getDiagnostics(fileName, content);
  }, [languageService, fileName]);

  const updateFile = useCallback(async (content: string): Promise<void> => {
    if (!languageService || !fileName) return;
    return languageService.updateFile(fileName, content);
  }, [languageService, fileName]);

  return {
    isElectron,
    getCompletions,
    getHover,
    getDefinition,
    getSignatureHelp,
    getDiagnostics,
    updateFile
  };
}