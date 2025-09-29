import { NextRequest, NextResponse } from 'next/server';

// Importar el servicio de IA singleton para usar la configuración existente
import { aiService } from '../../../../lib/ai-service';

interface AIHoverRequest {
  code: string;
  language: string;
  position: number;
  symbol?: string;
  context?: string;
  projectContext?: Record<string, any>;
}

interface AIHoverResponse {
  contents: {
    kind: 'markdown';
    value: string;
  };
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

// Función para llamar a la API de IA usando OpenRouter (igual que AIService)
async function callAIForHover(aiService: any, code: string, language: string, symbol: string, context: string, projectContext?: Record<string, any>): Promise<string> {
  // Construir información del proyecto
  let projectInfo = '';
  if (projectContext) {
    const relevantFiles = Object.values(projectContext).slice(0, 10); // Limitar a 10 archivos relevantes
    projectInfo = `\n\nInformación del proyecto:\n${relevantFiles.map((file: any) => 
      `- ${file.name} (${file.extension}): ${file.summary || 'Archivo de código'}`
    ).join('\n')}`;
  }

  const prompt = `Eres un experto programador que explica código en español de manera clara y detallada.

Analiza el siguiente código ${language.toUpperCase()} y explica qué hace el símbolo "${symbol}" en este contexto:

Código completo:
\`\`\`${language}
${code}
\`\`\`

Contexto adicional del archivo: ${context}${projectInfo}

Proporciona una explicación en español que incluya:
1. Qué es este símbolo (función, variable, clase, etc.)
2. Qué hace exactamente
3. Parámetros y tipos de retorno si aplica
4. Un ejemplo de uso si es relevante
5. Consideraciones importantes o mejores prácticas

Mantén la explicación concisa pero completa, enfocándote en aspectos técnicos importantes.`;

  try {
    // Obtener configuración desde el provider global
    const provider = aiService.getProvider();

    if (provider.type !== 'openrouter') {
      throw new Error('Proveedor de IA no soportado. Configure OpenRouter en los settings.');
    }

    if (!provider.apiKey) {
      throw new Error('OpenRouter API key no configurada. Configure su API key en los settings de la aplicación.');
    }

    const openRouterModel = provider.model || 'meta-llama/llama-3.1-8b-instruct:free';

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
        'X-Title': 'Code Editor AI Assistant'
      },
      body: JSON.stringify({
          model: openRouterModel,
        messages: [
          {
            role: 'system',
            content: 'Eres un experto programador que explica código de manera clara y detallada en español.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error de API OpenRouter: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'No se pudo generar una explicación.';
  } catch (error) {
    console.error('Error llamando a la API de IA:', error);
    throw error;
  }
}

// Función para extraer el símbolo bajo el cursor
function extractSymbolAtPosition(code: string, position: number): { symbol: string; context: string } {
  const lines = code.substring(0, position).split('\n');
  const currentLine = lines[lines.length - 1] || '';
  const character = lines[lines.length - 1].length;

  // Buscar palabra bajo el cursor
  const beforeCursor = currentLine.substring(0, character);
  const afterCursor = currentLine.substring(character);

  // Encontrar límites de la palabra
  const wordMatch = beforeCursor.match(/(\w+)$/);
  if (!wordMatch) {
    return { symbol: '', context: currentLine.trim() };
  }

  const word = wordMatch[1];
  const wordStart = beforeCursor.length - word.length;

  // Extraer más contexto (líneas alrededor)
  const startLine = Math.max(0, lines.length - 3);
  const endLine = Math.min(lines.length + 2, lines.length);
  const contextLines = lines.slice(startLine, endLine);
  const context = contextLines.join('\n');

  return { symbol: word, context };
}

export async function POST(request: NextRequest) {
  try {
    const body: AIHoverRequest = await request.json();
    const { code, language, position, symbol, context, projectContext } = body;

    if (!code || !language) {
      return NextResponse.json(
        { error: 'Se requiere código y lenguaje' },
        { status: 400 }
      );
    }

    // Extraer símbolo si no se proporcionó
    let targetSymbol = symbol;
    let targetContext = context || '';

    if (!targetSymbol) {
      const extracted = extractSymbolAtPosition(code, position);
      targetSymbol = extracted.symbol;
      targetContext = extracted.context;
    }

    if (!targetSymbol) {
      return NextResponse.json(
        { hover: null },
        { status: 200 }
      );
    }

    // Llamar a la IA para generar la explicación
    const explanation = await callAIForHover(aiService, code, language, targetSymbol, targetContext, projectContext);

    // Calcular el rango para el hover
    const lines = code.substring(0, position).split('\n');
    const line = lines.length - 1;
    const character = lines[lines.length - 1].length;

    const beforeCursor = lines[line].substring(0, character);
    const wordMatch = beforeCursor.match(/(\w+)$/);

    let range;
    if (wordMatch) {
      const word = wordMatch[1];
      const wordStart = beforeCursor.length - word.length;
      range = {
        start: { line, character: wordStart },
        end: { line, character: wordStart + word.length }
      };
    }

    const hoverResponse: AIHoverResponse = {
      contents: {
        kind: 'markdown',
        value: explanation
      },
      range
    };

    return NextResponse.json({ hover: hoverResponse });

  } catch (error) {
    console.error('Error en hover con IA:', error);

    // Fallback a mensaje de error
    const errorResponse: AIHoverResponse = {
      contents: {
        kind: 'markdown',
        value: `🤖 **Error de IA**\n\nNo se pudo generar una explicación automática. ${error instanceof Error ? error.message : 'Error desconocido'}`
      }
    };

    return NextResponse.json({ hover: errorResponse });
  }
}