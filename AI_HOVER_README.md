# Sistema de Hover Inteligente con IA

Este sistema proporciona explicaciones contextuales de código usando inteligencia artificial a través de OpenRouter.

## Características

- **Hover LSP Tradicional**: Soporte completo para múltiples lenguajes (C++, Python, Go, Java, HTML, CSS, JSON)
- **Hover con IA**: Explicaciones inteligentes generadas por IA para cualquier símbolo o código
- **Internacionalización**: Todas las explicaciones y mensajes en español
- **Integración Fluida**: Funciona junto con el sistema de hover existente

## Cómo Usar

### Hover LSP Tradicional
1. Pasa el mouse sobre cualquier símbolo en el código
2. Aparecerá automáticamente un tooltip con información del LSP correspondiente

### Hover con IA
1. Coloca el cursor sobre el símbolo que quieres explicar
2. Presiona `Ctrl + Alt + H` (o `Cmd + Alt + H` en Mac)
3. Aparecerá un tooltip con explicación generada por IA

## Configuración

### Variables de Entorno
Crea un archivo `.env.local` con:

```env
OPENROUTER_API_KEY=tu_api_key_aqui
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

### Modelos Soportados
- `anthropic/claude-3.5-sonnet` (recomendado)
- `openai/gpt-4`
- `meta-llama/llama-3.1-70b-instruct`
- Cualquier modelo disponible en OpenRouter

## Arquitectura

### Componentes Principales

1. **`AIHoverProvider`** (`components/ai-hover-provider.tsx`)
   - Context provider que gestiona el estado global del hover IA
   - Proporciona hooks para activar/desactivar hovers

2. **`AIHoverTooltip`** (`components/ai-hover-tooltip.tsx`)
   - Componente UI que muestra las explicaciones de IA
   - Soporta estados de carga, error y contenido markdown

3. **`useAIService`** (`hooks/use-ai-service.ts`)
   - Hook personalizado para gestionar llamadas a la API de IA
   - Maneja estado de carga, errores y cache

### API Endpoints

- **`POST /api/ai/hover`**: Genera explicaciones de código usando IA
  - Body: `{ code, language, position, symbol?, context? }`
  - Respuesta: `{ explanation: string }`

### Integración en Editor

El sistema se integra automáticamente en `EditorContent` mediante:

1. **AIHoverProvider** envuelve el editor principal
2. **Atajo de teclado** `Ctrl+Alt+H` activa el hover IA
3. **Posicionamiento inteligente** del tooltip cerca del cursor
4. **Extracción automática** de símbolos y contexto

## Lenguajes Soportados

### Hover LSP Completo
- **C++**: Con clangd LSP
- **Python**: Con Pyright
- **Go**: Con gopls
- **Java**: Con vscode language servers
- **HTML/CSS/JSON**: Con servidores de lenguaje integrados

### Hover IA Universal
Funciona con cualquier lenguaje de programación soportado por el editor.

## Ejemplos de Uso

### Hover sobre una función Python
```python
def calcular_factorial(n):
    # Coloca cursor aquí y presiona Ctrl+Alt+H
    if n <= 1:
        return 1
    return n * calcular_factorial(n - 1)
```

**Explicación IA**: "Esta función calcula el factorial de un número usando recursión. El factorial de n (n!) es el producto de todos los números enteros positivos desde 1 hasta n."

### Hover sobre una clase C++
```cpp
class MiClase {
public:
    // Coloca cursor aquí y presiona Ctrl+Alt+H
    void metodo() {
        // implementación
    }
};
```

**Explicación IA**: "Esta es una definición de clase en C++. Las clases son tipos de datos definidos por el usuario que encapsulan datos y funciones relacionadas."

## Desarrollo

### Agregar Nuevo Lenguaje LSP
1. Crear endpoint en `app/api/[language]/hover/route.ts`
2. Implementar lógica de hover específica del lenguaje
3. Agregar traducciones al español
4. Actualizar documentación

### Personalizar Explicaciones IA
Modificar el prompt en `app/api/ai/hover/route.ts` para cambiar el estilo de las explicaciones.

## Solución de Problemas

### El hover IA no aparece
- Verificar que `OPENROUTER_API_KEY` esté configurada
- Comprobar conexión a internet
- Revisar logs en la consola del navegador

### Errores de LSP
- Verificar que los servidores LSP estén instalados
- Comprobar configuración en `lib/[language]/service.ts`

### Rendimiento
- Las explicaciones IA se cachean automáticamente
- Implementar debounce para evitar llamadas excesivas

## Contribuir

Para contribuir al sistema de hover:

1. Seguir la estructura existente de endpoints LSP
2. Mantener consistencia en las traducciones al español
3. Agregar tests para nueva funcionalidad
4. Actualizar esta documentación</content>
<parameter name="filePath">/Users/davidmoreno/Desktop/code-highlight/AI_HOVER_README.md