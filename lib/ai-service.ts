// AI Service for communicating with multiple AI providers
export interface EditorChatRequest {
  message: string;
  active_file?: string;
  file_content?: string;
  selected_text?: string;
  has_selection: boolean;
  max_tokens?: number;
}

export interface AIProvider {
  type: 'local' | 'openrouter';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface EditorChatResponse {
  message: string;
  is_code_response: boolean;
  should_create_file: boolean;
  file_name?: string;
  error?: string;
}

export interface FileModification {
  type: 'create' | 'update' | 'comment';
  file_path: string;
  content: string;
  original_content?: string;
}

class AIService {
  private provider: AIProvider;

  constructor(provider: AIProvider = { type: 'local', baseUrl: 'http://localhost:8080' }) {
    this.provider = provider;
  }

  setProvider(provider: AIProvider) {
    this.provider = provider;
  }

  getProvider(): AIProvider {
    return this.provider;
  }

  async sendEditorChat(request: EditorChatRequest): Promise<EditorChatResponse> {
    try {
      if (this.provider.type === 'local') {
        return await this.sendLocalRequest(request);
      } else if (this.provider.type === 'openrouter') {
        return await this.sendOpenRouterRequest(request);
      } else {
        throw new Error('Unsupported AI provider');
      }
    } catch (error) {
      console.error('AI Service Error:', error);
      throw error;
    }
  }

  private async sendLocalRequest(request: EditorChatRequest): Promise<EditorChatResponse> {
    const baseUrl = this.provider.baseUrl || 'http://localhost:8080';
    const response = await fetch(`${baseUrl}/ai/editor-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: EditorChatResponse = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    return data;
  }

  private async sendOpenRouterRequest(request: EditorChatRequest): Promise<EditorChatResponse> {
    // Comprehensive API key validation
    if (!this.provider.apiKey) {
      throw new Error('❌ OpenRouter API key is required. Please configure your API key in the settings.');
    }

    const trimmedKey = this.provider.apiKey.trim();
    if (!trimmedKey) {
      throw new Error('❌ OpenRouter API key cannot be empty. Please enter a valid API key.');
    }

    // Validate API key format (OpenRouter keys start with sk-or-)
    if (!trimmedKey.startsWith('sk-or-')) {
      throw new Error('❌ Invalid OpenRouter API key format. API keys should start with "sk-or-". Please check your API key.');
    }

    // Check minimum length (OpenRouter keys are typically longer)
    if (trimmedKey.length < 20) {
      throw new Error('❌ OpenRouter API key appears to be too short. Please verify your API key.');
    }

    // Update the provider with the trimmed key
    this.provider.apiKey = trimmedKey;

    const model = this.provider.model || 'meta-llama/llama-3.1-8b-instruct:free';
    
    // Build the prompt based on context
    let prompt = request.message;
    if (request.has_selection && request.selected_text) {
      prompt = `The user has selected the following code/text from file '${request.active_file}':\n\n\`\`\`\n${request.selected_text}\n\`\`\`\n\nUser question: ${request.message}\n\nPlease provide a response that directly addresses the selected code.`;
    } else if (request.active_file && request.file_content) {
      prompt = `The user is working on file '${request.active_file}' with the following content:\n\n\`\`\`\n${request.file_content}\n\`\`\`\n\nUser question: ${request.message}\n\nPlease provide a helpful response related to this file.`;
    }

    try {
      console.log('Sending request to OpenRouter with model:', model);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.provider.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
          'X-Title': 'Code Editor AI Assistant'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: request.max_tokens || 1000,
          temperature: 0.7
        })
      });

      console.log('OpenRouter response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter error response:', errorText);
        
        let errorMessage = `OpenRouter API error (${response.status})`;
        
        if (response.status === 401) {
          errorMessage = 'Invalid OpenRouter API key. Please check your API key in the settings.';
        } else if (response.status === 403) {
          errorMessage = 'Access forbidden. Your OpenRouter API key may not have sufficient permissions.';
        } else if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please wait a moment before trying again.';
        } else if (response.status >= 500) {
          errorMessage = 'OpenRouter server error. Please try again later.';
        } else {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage += ` - ${errorData.error.message}`;
            }
          } catch {
            errorMessage += ` - ${errorText.substring(0, 100)}`;
          }
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('OpenRouter response data:', data);
      
      if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message || 'Unknown error'}`);
      }
      
      const message = data.choices?.[0]?.message?.content || 'No response generated';

      return {
        message,
        is_code_response: this.isCodeResponse(message),
        should_create_file: !request.has_selection && !request.active_file,
        file_name: 'chat.md'
      };
    } catch (error) {
      console.error('OpenRouter request failed:', error);
      
      if (error instanceof TypeError) {
        if (error.message.includes('fetch')) {
          throw new Error('Network error: Unable to connect to OpenRouter. Please check your internet connection and try again.');
        } else if (error.message.includes('JSON')) {
          throw new Error('Invalid response from OpenRouter. The service may be temporarily unavailable.');
        }
      }
      
      // Re-throw the error if it's already a custom error message
      if (error instanceof Error && error.message.includes('OpenRouter')) {
        throw error;
      }
      
      throw new Error(`Unexpected error connecting to OpenRouter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.provider.type === 'local') {
        const baseUrl = this.provider.baseUrl || 'http://localhost:8080';
        const response = await fetch(`${baseUrl}/health`);
        return response.ok;
      } else if (this.provider.type === 'openrouter') {
        // For OpenRouter, validate API key and test connectivity
        if (!this.provider.apiKey || !this.provider.apiKey.trim()) {
          console.log('Health check failed: No API key provided');
          return false;
        }

        if (!this.provider.apiKey.startsWith('sk-or-')) {
          console.log('Health check failed: Invalid API key format');
          return false;
        }

        // Test with a minimal request to validate API key and connectivity
        try {
          const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.provider.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
            },
          });
          
          console.log('OpenRouter health check response status:', response.status);
          return response.ok;
        } catch (error) {
          console.error('OpenRouter health check network error:', error);
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Helper method to determine if response contains code
  isCodeResponse(response: string): boolean {
    const codeIndicators = [
      '```',
      'function ',
      'class ',
      'const ',
      'let ',
      'var ',
      'import ',
      'export ',
      'def ',
      'public ',
      'private ',
      'protected ',
      '#include',
      'package ',
    ];

    return codeIndicators.some(indicator => 
      response.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  // Extract code blocks from response
  extractCodeBlocks(response: string): string[] {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const matches = response.match(codeBlockRegex);
    
    if (!matches) return [];
    
    return matches.map(block => {
      // Remove the ``` markers and language identifier
      return block.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');
    });
  }

  // Clean response text (remove code blocks for commenting)
  cleanResponseText(response: string): string {
    // Remove code blocks but keep the rest of the text
    return response.replace(/```[\s\S]*?```/g, '[Code block removed]').trim();
  }

  // Comment text based on file extension
  commentText(text: string, filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase() || '';
    
    const commentStyles: Record<string, { single: string; multiStart?: string; multiEnd?: string }> = {
      // JavaScript/TypeScript family
      'js': { single: '//' },
      'jsx': { single: '//' },
      'ts': { single: '//' },
      'tsx': { single: '//' },
      'mjs': { single: '//' },
      'cjs': { single: '//' },
      
      // Web technologies
      'css': { single: '/*', multiStart: '/*', multiEnd: '*/' },
      'scss': { single: '//' },
      'sass': { single: '//' },
      'less': { single: '//' },
      'html': { single: '<!--', multiStart: '<!--', multiEnd: '-->' },
      'xml': { single: '<!--', multiStart: '<!--', multiEnd: '-->' },
      'svg': { single: '<!--', multiStart: '<!--', multiEnd: '-->' },
      
      // Programming languages
      'py': { single: '#' },
      'python': { single: '#' },
      'rb': { single: '#' },
      'ruby': { single: '#' },
      'php': { single: '//' },
      'java': { single: '//' },
      'c': { single: '//' },
      'cpp': { single: '//' },
      'cc': { single: '//' },
      'cxx': { single: '//' },
      'h': { single: '//' },
      'hpp': { single: '//' },
      'cs': { single: '//' },
      'go': { single: '//' },
      'rs': { single: '//' },
      'rust': { single: '//' },
      'swift': { single: '//' },
      'kt': { single: '//' },
      'kotlin': { single: '//' },
      'scala': { single: '//' },
      'dart': { single: '//' },
      
      // Shell and config
      'sh': { single: '#' },
      'bash': { single: '#' },
      'zsh': { single: '#' },
      'fish': { single: '#' },
      'ps1': { single: '#' },
      'yaml': { single: '#' },
      'yml': { single: '#' },
      'toml': { single: '#' },
      'ini': { single: ';' },
      'conf': { single: '#' },
      
      // Database
      'sql': { single: '--' },
      'mysql': { single: '--' },
      'postgres': { single: '--' },
      'sqlite': { single: '--' },
      
      // Other
      'lua': { single: '--' },
      'vim': { single: '"' },
      'r': { single: '#' },
      'matlab': { single: '%' },
      'tex': { single: '%' },
      'latex': { single: '%' },
    };

    const style = commentStyles[extension];
    if (!style) {
      // Default to // for unknown file types
      return text.split('\n').map(line => `// ${line}`).join('\n');
    }

    // For multi-line comments, use them if available
    if (style.multiStart && style.multiEnd) {
      return `${style.multiStart}\n${text}\n${style.multiEnd}`;
    }

    // Otherwise use single-line comments
    return text.split('\n').map(line => `${style.single} ${line}`).join('\n');
  }

  // Create file diff for modifications
  createFileDiff(originalContent: string, newContent: string): {
    additions: string[];
    deletions: string[];
    modifications: Array<{line: number, old: string, new: string}>;
  } {
    const originalLines = originalContent.split('\n');
    const newLines = newContent.split('\n');
    
    const additions: string[] = [];
    const deletions: string[] = [];
    const modifications: Array<{line: number, old: string, new: string}> = [];

    // Simple diff algorithm - can be enhanced with more sophisticated algorithms
    const maxLength = Math.max(originalLines.length, newLines.length);
    
    for (let i = 0; i < maxLength; i++) {
      const oldLine = originalLines[i];
      const newLine = newLines[i];
      
      if (oldLine === undefined && newLine !== undefined) {
        additions.push(newLine);
      } else if (oldLine !== undefined && newLine === undefined) {
        deletions.push(oldLine);
      } else if (oldLine !== newLine) {
        modifications.push({
          line: i + 1,
          old: oldLine,
          new: newLine
        });
      }
    }

    return { additions, deletions, modifications };
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;