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

  setWorkspacePath(path: string) {
    this.workspacePath = path;
  }

  async createChatsFolder(): Promise<boolean> {
    if (!this.workspacePath) {
      console.error('Workspace path not set');
      return false;
    }

    try {
      const result = await (window as any).electronAPI?.createChatsFolder(this.workspacePath);
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
      const result = await (window as any).electronAPI?.saveChatToFile(
        this.workspacePath,
        this.currentSession.name,
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
      const result = await (window as any).electronAPI?.listChatFiles(this.workspacePath);
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