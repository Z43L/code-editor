import { NextRequest, NextResponse } from 'next/server';
import type { AIProvider } from '../../../../lib/ai-service';

interface AICodeRequest {
  request: string;
  language: string;
  fileContext: string;
  projectContext?: Record<string, any>;
  provider?: AIProvider;
}

interface AICodeResponse {
  code: string;
}

// Función para llamar a la API de IA usando OpenRouter
async function callAIForCode(request: string, language: string, fileContext: string, provider: AIProvider, projectContext?: Record<string, any>): Promise<string> {
  // Construir información del proyecto
  let projectInfo = '';
  if (projectContext) {
    const relevantFiles = Object.values(projectContext).slice(0, 10); // Limitar a 10 archivos relevantes
    projectInfo = `\n\nInformación del proyecto:\n${relevantFiles.map((file: any) =>
      `- ${file.name} (${file.extension}): ${file.summary || 'Archivo de código'}`
    ).join('\n')}`;
  }

  const prompt = `Eres un experto programador que genera código de alta calidad.

El usuario te pide que generes código basado en esta solicitud: "${request}"

Contexto del archivo (100 líneas antes y después de la posición del comentario):
\`\`\`${language}
${fileContext}
\`\`\`${projectInfo}

INSTRUCCIONES IMPORTANTES:
1. Responde ÚNICAMENTE con el código generado, sin explicaciones adicionales
2. El código debe ser válido y funcional en el contexto proporcionado
3. Mantén el estilo y convenciones del código existente en el archivo
4. Si es código nuevo, intégralo naturalmente con el contexto existente
5. NO incluyas marcadores de código (\`\`\`) en tu respuesta
6. NO agregues comentarios explicativos a menos que sean parte del código funcional

Genera el código solicitado:`;

  try {
    // El provider ya viene validado desde el request
    if (!provider) {
      throw new Error('Proveedor de IA no configurado. Configure OpenRouter desde los settings de la aplicación.');
    }

    if (provider.type !== 'openrouter') {
      throw new Error('Proveedor de IA no soportado. Configure OpenRouter desde los settings.');
    }

    if (!provider.apiKey || provider.apiKey.trim() === '') {
      throw new Error('OpenRouter API key no configurada. Configure su API key desde los settings de la aplicación.');
    }

    // Verificar que no sea la API key de ejemplo
    if (provider.apiKey === 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
      throw new Error('La API key configurada es de ejemplo. Obtén tu API key real en https://openrouter.ai/keys y configúrala en los settings.');
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
            content: 'Eres un experto programador que genera código de alta calidad. Responde únicamente con código válido, sin explicaciones.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error de API OpenRouter: ${response.status}`);
    }

    const data = await response.json();
    const generatedCode = data.choices[0]?.message?.content || '';

    // Limpiar la respuesta para asegurar que solo contenga código
    return generatedCode.trim();
  } catch (error) {
    console.error('Error llamando a la API de IA:', error);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AICodeRequest = await request.json();
    const { request: userRequest, language, fileContext, projectContext, provider } = body;

    if (!userRequest || !language || !fileContext) {
      return NextResponse.json(
        { error: 'Se requiere solicitud, lenguaje y contexto del archivo' },
        { status: 400 }
      );
    }

    if (!provider) {
      return NextResponse.json(
        { error: 'Se requiere configuración del proveedor de IA' },
        { status: 400 }
      );
    }

    // Llamar a la IA para generar el código
    const generatedCode = await callAIForCode(userRequest, language, fileContext, provider, projectContext);

    const response: AICodeResponse = {
      code: generatedCode
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error generando código con IA:', error);

    return NextResponse.json({
      error: `No se pudo generar el código. ${error instanceof Error ? error.message : 'Error desconocido'}`
    }, { status: 500 });
  }
}