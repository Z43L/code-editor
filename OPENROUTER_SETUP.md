# 🚀 Configuración de OpenRouter para IA

## Cómo configurar la API key de OpenRouter

### 1. Obtén tu API Key gratuita
1. Ve a [https://openrouter.ai/keys](https://openrouter.ai/keys)
2. Crea una cuenta gratuita
3. Genera una nueva API key

### 2. Configura la API key en la aplicación
1. Abre la aplicación del editor de código
2. En el panel lateral izquierdo, haz clic en el botón de **Settings** (⚙️)
3. En la sección **"AI Configuration"**, encontrarás:
   - **API Key**: Pega tu API key real aquí
   - **Modelo**: Selecciona el modelo que prefieras (ej: `anthropic/claude-3.5-sonnet`)

### 3. Verifica la configuración
- Haz clic en **"Test Connection"** para verificar que la API key funcione
- Si es correcta, verás un mensaje de confirmación

## ✨ Funcionalidades disponibles

Una vez configurada la API key, podrás usar:

### 🤖 Hover con IA
- Pasa el mouse sobre símbolos en el código
- Obtén explicaciones generadas por IA del código

### 💻 Generación automática de código
- Escribe comentarios como: `// $$ crea una función que valida emails $$`
- La IA generará automáticamente el código correspondiente

### 🎯 Soporte para múltiples lenguajes
- JavaScript, TypeScript, Python, C++, Java, Go, etc.

## 🔧 Solución de problemas

### Error 401 (Unauthorized)
- Verifica que la API key sea correcta
- Asegúrate de que no sea la API key de ejemplo

### Error de conexión
- Verifica tu conexión a internet
- OpenRouter podría tener problemas temporales

### Configuración no se guarda
- La configuración se guarda automáticamente en localStorage
- Si usas múltiples dispositivos, configura en cada uno

## 📚 Modelos disponibles

- `anthropic/claude-3.5-sonnet` - Recomendado para código de alta calidad
- `meta-llama/llama-3.1-8b-instruct:free` - Gratuito, buena calidad
- `openai/gpt-4o-mini` - Rápido y eficiente
- `google/gemini-pro` - Bueno para explicaciones

¡Disfruta programando con IA! 🤖✨