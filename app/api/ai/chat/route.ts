import { NextRequest, NextResponse } from 'next/server';
import type { AIProvider, EditorChatRequest, EditorChatResponse } from '../../../../lib/ai-service';

// Almacenamiento temporal del provider (idealmente usar una base de datos o variable de sesión)
let currentProvider: AIProvider = {
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2'
};

// Helper function to build prompt (same as in ai-service.ts)
function buildPrompt(request: EditorChatRequest): string {
  if (request.message.includes('---\nProject Context')) {
    return request.message;
  }

  const userIntent = request.intent || request.message;
  const rawUserInput = request.original_user_message || userIntent;

  if (request.context) {
    const sections: string[] = [];
    const { activeFile, relatedFiles, selection } = request.context;

    if (activeFile) {
      const activeSummary = activeFile.summary || activeFile.preview || '';
      const lines = [
        `**Current File:** \`${activeFile.name}\` (${activeFile.extension || 'unknown'})`,
        activeSummary ? `Summary: ${activeSummary}` : '',
      ].filter(Boolean);
      sections.push(lines.join('\n'));
    }

    if (relatedFiles && relatedFiles.length > 0) {
      const relatedList = relatedFiles
        .slice(0, 5)
        .map(f => `- \`${f.name}\` (${f.extension}): ${f.summary || f.preview || 'related file'}`)
        .join('\n');
      sections.push(`**Related Files:**\n${relatedList}`);
    }

    if (selection && selection.text) {
      const selectionPreview = selection.truncated 
        ? `${selection.text.substring(0, 500)}... (truncated, original length: ${selection.original_length})`
        : selection.text;
      sections.push(`**Selected Code:**\n\`\`\`\n${selectionPreview}\n\`\`\``);
    }

    const contextBlock = sections.join('\n\n');
    return `${rawUserInput}\n\n---\nProject Context\n${contextBlock}`;
  }

  return rawUserInput;
}

function isCodeResponse(response: string): boolean {
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
  ];
  return codeIndicators.some(indicator => response.includes(indicator));
}

async function sendOllamaRequest(request: EditorChatRequest, provider: AIProvider): Promise<EditorChatResponse> {
  const baseUrl = provider.baseUrl || 'http://localhost:11434';
  const model = provider.model || 'llama3.2';
  const prompt = buildPrompt(request);

  try {
    console.log('🦙 Enviando solicitud a Ollama:', { baseUrl, model });
    
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
      })
    });

    console.log('📡 Respuesta de Ollama:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error de Ollama:', errorText);
      
      let errorMessage = `Error de Ollama (${response.status})`;
      
      if (response.status === 404) {
        errorMessage = `Modelo "${model}" no encontrado. Ejecuta: ollama pull ${model}`;
      } else if (response.status >= 500) {
        errorMessage = 'Error del servidor Ollama. Verifica que esté ejecutándose.';
      } else {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage += ` - ${errorData.error}`;
          }
        } catch {
          errorMessage += ` - ${errorText}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Respuesta exitosa de Ollama');
    
    if (data.error) {
      throw new Error(`Error de Ollama: ${data.error}`);
    }
    
    const message = data.message?.content || 'Sin respuesta';

    return {
      message,
      is_code_response: isCodeResponse(message),
      should_create_file: !request.has_selection && !request.active_file,
      file_name: 'chat.md'
    };
  } catch (error) {
    console.error('💥 Fallo en solicitud a Ollama:', error);
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`No se puede conectar a Ollama en ${baseUrl}. Verifica que esté ejecutándose: ollama serve`);
    }
    
    if (error instanceof Error && error.message.includes('Ollama')) {
      throw error;
    }
    
    throw new Error(`Error inesperado con Ollama: ${error instanceof Error ? error.message : 'Desconocido'}`);
  }
}

async function sendOpenRouterRequest(request: EditorChatRequest, provider: AIProvider): Promise<EditorChatResponse> {
  if (!provider.apiKey) {
    throw new Error('API key requerida para OpenRouter');
  }

  const model = provider.model || 'anthropic/claude-3.5-sonnet';
  const prompt = buildPrompt(request);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
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
      max_tokens: 80000,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de OpenRouter (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message?.content || 'Sin respuesta';

  return {
    message,
    is_code_response: isCodeResponse(message),
    should_create_file: !request.has_selection && !request.active_file,
    file_name: 'chat.md'
  };
}

async function sendLocalRequest(request: EditorChatRequest, provider: AIProvider): Promise<EditorChatResponse> {
  const baseUrl = provider.baseUrl || 'http://localhost:8080';
  const payload = {
    ...request,
    message: buildPrompt(request),
  };

  const response = await fetch(`${baseUrl}/ai/editor-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request: chatRequest, provider }: { request: EditorChatRequest; provider?: AIProvider } = body;

    // Usar el provider proporcionado o el actual
    const activeProvider = provider || currentProvider;
    
    // Actualizar el provider actual si se proporciona uno nuevo
    if (provider) {
      currentProvider = provider;
    }

    console.log('🤖 Procesando solicitud con:', activeProvider.type);

    let response: EditorChatResponse;

    if (activeProvider.type === 'ollama') {
      response = await sendOllamaRequest(chatRequest, activeProvider);
    } else if (activeProvider.type === 'openrouter') {
      response = await sendOpenRouterRequest(chatRequest, activeProvider);
    } else if (activeProvider.type === 'local') {
      response = await sendLocalRequest(chatRequest, activeProvider);
    } else {
      throw new Error('Proveedor de IA no soportado');
    }

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error en API de chat:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Error desconocido',
        message: '',
        is_code_response: false,
        should_create_file: false
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');
    const baseUrl = url.searchParams.get('baseUrl');
    const apiKey = url.searchParams.get('apiKey');

    let testProvider: AIProvider = currentProvider;

    // Si se proporcionan parámetros, usar esos
    if (provider) {
      testProvider = {
        type: provider as 'local' | 'openrouter' | 'ollama',
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined
      };
    }

    console.log('🏥 Health check para:', testProvider.type);

    let isHealthy = false;

    if (testProvider.type === 'ollama') {
      const ollamaUrl = testProvider.baseUrl || 'http://localhost:11434';
      try {
        const response = await fetch(`${ollamaUrl}/api/tags`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        isHealthy = response.ok;
        console.log('🦙 Ollama health check:', isHealthy ? '✅' : '❌');
      } catch (error) {
        console.error('❌ Ollama health check failed:', error);
        isHealthy = false;
      }
    } else if (testProvider.type === 'openrouter') {
      if (!testProvider.apiKey) {
        return NextResponse.json({ healthy: false, error: 'No API key provided' });
      }
      try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${testProvider.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
          },
        });
        isHealthy = response.ok;
        console.log('🔑 OpenRouter health check:', isHealthy ? '✅' : '❌');
      } catch (error) {
        console.error('❌ OpenRouter health check failed:', error);
        isHealthy = false;
      }
    } else if (testProvider.type === 'local') {
      const localUrl = testProvider.baseUrl || 'http://localhost:8080';
      try {
        const response = await fetch(`${localUrl}/health`);
        isHealthy = response.ok;
        console.log('🖥️  Local health check:', isHealthy ? '✅' : '❌');
      } catch (error) {
        console.error('❌ Local health check failed:', error);
        isHealthy = false;
      }
    }

    return NextResponse.json({ healthy: isHealthy });

  } catch (error) {
    console.error('❌ Error en health check:', error);
    return NextResponse.json(
      { healthy: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
