import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '../../../../lib/ai-service';
import type { AIProvider } from '../../../../lib/ai-service';

// Almacenamiento temporal en memoria para la configuración (en producción usarías una base de datos)
let globalAIProvider: AIProvider | null = null;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider }: { provider: AIProvider } = body;

    if (!provider || !provider.type) {
      return NextResponse.json(
        { error: 'Proveedor de IA no válido' },
        { status: 400 }
      );
    }

    // Validar configuración
    if (provider.type === 'openrouter') {
      if (!provider.apiKey) {
        return NextResponse.json(
          { error: 'API key requerida para OpenRouter' },
          { status: 400 }
        );
      }

      // Validar formato de API key
      if (!provider.apiKey.startsWith('sk-or-')) {
        return NextResponse.json(
          { error: 'Formato de API key de OpenRouter inválido' },
          { status: 400 }
        );
      }
    }

    // Configurar el provider global
    globalAIProvider = provider;
    aiService.setProvider(provider);

    console.log('✅ Configuración de IA actualizada:', {
      type: provider.type,
      model: provider.model,
      hasApiKey: !!provider.apiKey
    });

    return NextResponse.json({
      success: true,
      message: 'Configuración de IA actualizada correctamente'
    });

  } catch (error) {
    console.error('Error configurando IA:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const currentProvider = globalAIProvider || aiService.getProvider();

    return NextResponse.json({
      provider: {
        type: currentProvider.type,
        model: currentProvider.model,
        // No devolver la API key por seguridad
        hasApiKey: !!currentProvider.apiKey
      }
    });

  } catch (error) {
    console.error('Error obteniendo configuración de IA:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}