#!/bin/bash

# Script para generar iconos en diferentes formatos para electron-builder
# Requiere ImageMagick o usa sips en macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
ICON_SVG="$BUILD_DIR/icon.svg"

echo "🎨 Generando iconos para todas las plataformas..."

# Crear directorio build si no existe
mkdir -p "$BUILD_DIR"

# Verificar si existe el SVG base
if [ ! -f "$ICON_SVG" ]; then
    echo "❌ Error: No se encontró $ICON_SVG"
    exit 1
fi

# Función para generar PNG usando sips (macOS) o ImageMagick
generate_png() {
    local size=$1
    local output=$2
    
    if command -v sips >/dev/null 2>&1; then
        # Usar sips en macOS
        sips -s format png -Z "$size" "$ICON_SVG" --out "$output" >/dev/null 2>&1
        echo "✅ Generado: $output (${size}x${size})"
    elif command -v magick >/dev/null 2>&1; then
        # Usar ImageMagick
        magick "$ICON_SVG" -resize "${size}x${size}" "$output"
        echo "✅ Generado: $output (${size}x${size})"
    elif command -v convert >/dev/null 2>&1; then
        # Usar ImageMagick (versión antigua)
        convert "$ICON_SVG" -resize "${size}x${size}" "$output"
        echo "✅ Generado: $output (${size}x${size})"
    else
        echo "❌ Error: Se requiere ImageMagick o sips para generar iconos PNG"
        echo "   En macOS: sips está disponible por defecto"
        echo "   En Linux/Windows: instala ImageMagick"
        exit 1
    fi
}

# Generar PNG para Linux (diferentes tamaños)
echo "🐧 Generando iconos para Linux..."
generate_png 512 "$BUILD_DIR/icon.png"
generate_png 256 "$BUILD_DIR/icon-256.png"
generate_png 128 "$BUILD_DIR/icon-128.png"
generate_png 64 "$BUILD_DIR/icon-64.png"
generate_png 32 "$BUILD_DIR/icon-32.png"
generate_png 16 "$BUILD_DIR/icon-16.png"

# Generar ICO para Windows
echo "🪟 Generando icono para Windows..."
if command -v magick >/dev/null 2>&1; then
    # Crear ICO con múltiples tamaños usando ImageMagick
    magick "$ICON_SVG" \
        \( -clone 0 -resize 16x16 \) \
        \( -clone 0 -resize 32x32 \) \
        \( -clone 0 -resize 48x48 \) \
        \( -clone 0 -resize 64x64 \) \
        \( -clone 0 -resize 128x128 \) \
        \( -clone 0 -resize 256x256 \) \
        -delete 0 "$BUILD_DIR/icon.ico"
    echo "✅ Generado: $BUILD_DIR/icon.ico"
elif command -v convert >/dev/null 2>&1; then
    # Usar convert (ImageMagick versión antigua)
    convert "$ICON_SVG" \
        \( -clone 0 -resize 16x16 \) \
        \( -clone 0 -resize 32x32 \) \
        \( -clone 0 -resize 48x48 \) \
        \( -clone 0 -resize 64x64 \) \
        \( -clone 0 -resize 128x128 \) \
        \( -clone 0 -resize 256x256 \) \
        -delete 0 "$BUILD_DIR/icon.ico"
    echo "✅ Generado: $BUILD_DIR/icon.ico"
else
    echo "⚠️  Advertencia: No se pudo generar icon.ico (se requiere ImageMagick)"
    echo "   Puedes usar un convertidor online para crear icon.ico desde icon.png"
fi

# Generar ICNS para macOS
echo "🍎 Generando icono para macOS..."
if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    # Crear iconset usando sips e iconutil (macOS)
    ICONSET_DIR="$BUILD_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"
    
    # Generar todos los tamaños requeridos para ICNS
    sips -s format png -Z 16 "$ICON_SVG" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null 2>&1
    sips -s format png -Z 32 "$ICON_SVG" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null 2>&1
    sips -s format png -Z 32 "$ICON_SVG" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null 2>&1
    sips -s format png -Z 64 "$ICON_SVG" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null 2>&1
    sips -s format png -Z 128 "$ICON_SVG" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null 2>&1
    sips -s format png -Z 256 "$ICON_SVG" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null 2>&1
    sips -s format png -Z 256 "$ICON_SVG" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null 2>&1
    sips -s format png -Z 512 "$ICON_SVG" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null 2>&1
    sips -s format png -Z 512 "$ICON_SVG" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null 2>&1
    sips -s format png -Z 1024 "$ICON_SVG" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null 2>&1
    
    # Crear ICNS
    iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
    rm -rf "$ICONSET_DIR"
    echo "✅ Generado: $BUILD_DIR/icon.icns"
elif command -v magick >/dev/null 2>&1; then
    # Usar ImageMagick como alternativa
    magick "$ICON_SVG" -resize 512x512 "$BUILD_DIR/icon.icns"
    echo "✅ Generado: $BUILD_DIR/icon.icns (usando ImageMagick)"
else
    echo "⚠️  Advertencia: No se pudo generar icon.icns"
    echo "   En macOS: sips e iconutil están disponibles por defecto"
    echo "   En otras plataformas: instala ImageMagick"
fi

echo ""
echo "🎉 ¡Iconos generados exitosamente!"
echo "📁 Ubicación: $BUILD_DIR"
echo ""
echo "Archivos generados:"
ls -la "$BUILD_DIR"/icon.*