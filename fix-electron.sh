#!/bin/bash

# Script para descargar e instalar Electron manualmente
# Versión de Electron desde package.json
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")
PLATFORM="linux"
ARCH="x64"

# Directorio de Electron
ELECTRON_DIR="./node_modules/electron"
DIST_DIR="$ELECTRON_DIR/dist"

echo "🔧 Fixing Electron installation..."
echo "📦 Version: $ELECTRON_VERSION"
echo "💻 Platform: $PLATFORM-$ARCH"

# Crear directorio dist si no existe
mkdir -p "$DIST_DIR"

# URL de descarga de Electron desde GitHub
DOWNLOAD_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-${PLATFORM}-${ARCH}.zip"

echo "⬇️  Downloading Electron from: $DOWNLOAD_URL"

# Descargar Electron
cd "$DIST_DIR" || exit 1

if command -v wget > /dev/null; then
    wget -O electron.zip "$DOWNLOAD_URL"
elif command -v curl > /dev/null; then
    curl -L -o electron.zip "$DOWNLOAD_URL"
else
    echo "❌ Error: wget or curl is required to download Electron"
    exit 1
fi

# Verificar que se descargó correctamente
if [ ! -f "electron.zip" ]; then
    echo "❌ Error: Failed to download Electron"
    exit 1
fi

echo "📦 Extracting Electron..."

# Extraer el archivo
unzip -q electron.zip
rm electron.zip

# Dar permisos de ejecución al binario
chmod +x electron

# Crear archivo de versión
echo "$ELECTRON_VERSION" > version

echo "✅ Electron installed successfully!"
echo "📍 Location: $DIST_DIR/electron"

# Volver al directorio raíz
cd - > /dev/null

# Crear archivo path.txt (sin salto de línea)
printf "electron" > "$ELECTRON_DIR/path.txt"

# Verificar la instalación
if [ -f "$DIST_DIR/electron" ] && [ -f "$ELECTRON_DIR/path.txt" ] && [ -f "$DIST_DIR/version" ]; then
    echo "✅ Verification passed: All files exist"
    echo "   - Binary: $DIST_DIR/electron"
    echo "   - Path file: $ELECTRON_DIR/path.txt"
    echo "   - Version file: $DIST_DIR/version"
    ls -lh "$DIST_DIR/electron"
else
    echo "❌ Verification failed: Missing files"
    exit 1
fi

echo ""
echo "🔨 Building node-pty native module..."

# Compilar node-pty
cd "$ELECTRON_DIR/../node-pty"
if [ -f "binding.gyp" ]; then
    node-gyp rebuild > /dev/null 2>&1
    if [ -f "build/Release/pty.node" ]; then
        echo "✅ node-pty built successfully"
    else
        echo "⚠️  Warning: node-pty build may have failed"
    fi
    cd - > /dev/null
else
    echo "⚠️  Warning: node-pty binding.gyp not found"
    cd - > /dev/null
fi

echo ""
echo "🚀 You can now run: npm run electron:start"
