interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

interface ChatFile {
  name: string;
  path: string;
  relativePath: string;
}

class ChatService {
  private workspacePath: string | null = null;
  private currentSession: ChatSession | null = null;
  private chatsRelativeDirectory: string = 'chats';
  private chatFileName: string = 'chat.md';

  setWorkspacePath(path: string) {
    this.workspacePath = path;
  }

  setChatDirectory(relativePath: string) {
    const sanitized = this.sanitizeRelativeDirectory(relativePath);
    this.chatsRelativeDirectory = sanitized;
    console.log('[ChatService] Chat directory set to:', sanitized);
  }

  getChatDirectory(): string {
    return this.chatsRelativeDirectory;
  }

  setChatFileName(fileName: string) {
    this.chatFileName = this.sanitizeFileName(fileName);
    console.log('[ChatService] Chat file name set to:', this.chatFileName);
  }

  getChatFileName(): string {
    return this.chatFileName;
  }

  async createChatsFolder(): Promise<boolean> {
    if (!this.workspacePath) {
      console.error('Workspace path not set');
      return false;
    }

    try {
      const result = await (window as any).electronAPI?.createChatsFolder(
        this.workspacePath,
        this.chatsRelativeDirectory
      );
      const success = result?.success || false;
      
      // Refrescar el FileTree si se creó la carpeta exitosamente
      if (success && typeof window !== 'undefined' && (window as any).refreshFileTree) {
        console.log('[DEBUG] Refreshing FileTree after creating chats folder');
        setTimeout(() => {
          (window as any).refreshFileTree();
        }, 100); // Pequeño delay para asegurar que el archivo se haya creado
      }
      
      return success;
    } catch (error) {
      console.error('Error creating chats folder:', error);
      return false;
    }
  }

  async startNewSession(name: string): Promise<ChatSession> {
    const session: ChatSession = {
      id: this.generateSessionId(),
      name: name || `Chat ${new Date().toLocaleDateString()}`,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.currentSession = session;
    
    // Crear la carpeta de chats si no existe
    await this.createChatsFolder();
    
    return session;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    if (!this.currentSession) {
      throw new Error('No active chat session');
    }

    const message: ChatMessage = {
      role,
      content,
      timestamp: new Date()
    };

    this.currentSession.messages.push(message);
    this.currentSession.updatedAt = new Date();
  }

  async saveCurrentSession(): Promise<boolean> {
    if (!this.currentSession || !this.workspacePath) {
      console.error('No active session or workspace path');
      return false;
    }

    try {
      const content = this.formatSessionAsMarkdown(this.currentSession);
      console.log('[ChatService] Saving session to directory:', this.chatsRelativeDirectory);
      const result = await (window as any).electronAPI?.saveChatToFile(
        this.workspacePath,
        this.chatsRelativeDirectory,
        this.chatFileName,
        content
      );

      if (result?.success) {
        console.log('Chat saved successfully:', result.fileName);
        
        // Refrescar el FileTree después de guardar el archivo
        if (typeof window !== 'undefined' && (window as any).refreshFileTree) {
          console.log('[DEBUG] Refreshing FileTree after saving chat file');
          setTimeout(() => {
            (window as any).refreshFileTree();
          }, 100); // Pequeño delay para asegurar que el archivo se haya guardado
        }
        
        return true;
      } else {
        console.error('Failed to save chat:', result?.error);
        return false;
      }
    } catch (error) {
      console.error('Error saving chat session:', error);
      return false;
    }
  }

  async listChatFiles(): Promise<ChatFile[]> {
    if (!this.workspacePath) {
      console.error('Workspace path not set');
      return [];
    }

    try {
      const result = await (window as any).electronAPI?.listChatFiles(
        this.workspacePath,
        this.chatsRelativeDirectory
      );
      return result?.files || [];
    } catch (error) {
      console.error('Error listing chat files:', error);
      return [];
    }
  }

  async loadChatFromFile(filePath: string): Promise<string | null> {
    try {
      const result = await (window as any).electronAPI?.readChatFile(filePath);
      return result?.success ? result.content : null;
    } catch (error) {
      console.error('Error loading chat file:', error);
      return null;
    }
  }

  getCurrentSession(): ChatSession | null {
    return this.currentSession;
  }

  private generateSessionId(): string {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeRelativeDirectory(relativePath: string): string {
    if (!relativePath) {
      return 'chats';
    }

    const normalized = relativePath
      .trim()
      .replace(/^(?:\.\/)+/, '')
      .replace(/^\/+/, '')
      .replace(/^\\+/, '')
      .replace(/\\/g, '/');

    const safeSegments = normalized
      .split('/')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');

    return safeSegments.length > 0 ? safeSegments.join('/') : 'chats';
  }

  private sanitizeFileName(fileName: string): string {
    const fallback = 'chat.md';
    if (!fileName || typeof fileName !== 'string') {
      return fallback;
    }

    const trimmed = fileName.trim();
    if (!trimmed) {
      return fallback;
    }

    const normalized = trimmed.replace(/[\\/]/g, '');
    const hasMarkdownExtension = normalized.toLowerCase().endsWith('.md');
    const baseName = hasMarkdownExtension ? normalized.slice(0, -3) : normalized;

    const sanitizedBase = baseName
      .replace(/[^a-z0-9\-_.\s]/gi, '')
      .replace(/\s+/g, '-');

    const finalBase = sanitizedBase || 'chat';
    return `${finalBase}.md`;
  }

  private formatSessionAsMarkdown(session: ChatSession): string {
    const header = `# ${session.name}\n\n`;
    const metadata = `**Creado:** ${session.createdAt.toLocaleString()}\n`;
    const updated = `**Actualizado:** ${session.updatedAt.toLocaleString()}\n\n`;
    const separator = '---\n\n';

    const messages = session.messages.map(message => {
      const roleLabel = message.role === 'user' ? '👤 **Usuario**' : '🤖 **Asistente**';
      const timestamp = `*${message.timestamp.toLocaleTimeString()}*`;
      return `## ${roleLabel} (${timestamp})\n\n${message.content}\n\n`;
    }).join('');

    return header + metadata + updated + separator + messages;
  }

  // Método para auto-guardar después de cada mensaje
  async autoSave(): Promise<void> {
    if (this.currentSession && this.currentSession.messages.length > 0) {
      await this.saveCurrentSession();
    }
  }

  // Configuración para nombres de archivo personalizados
  private chatNameConfig: string = 'Chat';

  setChatNameConfig(name: string): void {
    this.chatNameConfig = name;
  }

  getChatNameConfig(): string {
    return this.chatNameConfig;
  }

  // Generar nombre automático basado en configuración
  generateChatName(): string {
    const timestamp = new Date().toLocaleDateString('es-ES').replace(/\//g, '-');
    return `${this.chatNameConfig} ${timestamp}`;
  }
}

// Instancia singleton del servicio
export const chatService = new ChatService();

// Tipos exportados
export type { ChatMessage, ChatSession, ChatFile };