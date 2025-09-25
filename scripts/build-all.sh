#!/bin/bash

# Script para compilar la aplicación Electron para todas las plataformas
# Mac Intel, Windows (x64 e ia32), y Linux (x64)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "🚀 Iniciando compilación multiplataforma de Editor React"
echo "📁 Directorio del proyecto: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR"

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo "❌ Error: No se encontró package.json en el directorio actual"
    exit 1
fi

# Verificar que los iconos existen
echo "🔍 Verificando iconos..."
if [ ! -f "build/icon.png" ] || [ ! -f "build/icon.ico" ] || [ ! -f "build/icon.icns" ]; then
    echo "⚠️  Iconos faltantes. Generando iconos..."
    if [ -f "scripts/generate-icons.sh" ]; then
        ./scripts/generate-icons.sh
    else
        echo "❌ Error: No se encontró el script de generación de iconos"
        exit 1
    fi
fi

# Limpiar builds anteriores
echo "🧹 Limpiando builds anteriores..."
rm -rf dist/
rm -rf out/
rm -rf .next/

# Instalar dependencias si es necesario
echo "📦 Verificando dependencias..."
if [ ! -d "node_modules" ]; then
    echo "📥 Instalando dependencias..."
    pnpm install
fi

# Build de Next.js (con export automático)
echo "⚛️  Compilando aplicación Next.js..."
pnpm run build

echo ""
echo "🏗️  Iniciando compilación de ejecutables..."
echo ""

# Función para compilar con manejo de errores
build_platform() {
    local platform=$1
    local platform_name=$2
    local emoji=$3
    
    echo "${emoji} Compilando para ${platform_name}..."
    
    if pnpm run "build:${platform}"; then
        echo "✅ ${platform_name} compilado exitosamente"
        
        # Mostrar archivos generados
        if [ -d "dist" ]; then
            echo "📁 Archivos generados para ${platform_name}:"
            find dist -name "*${platform}*" -o -name "*.dmg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" | head -5
        fi
    else
        echo "❌ Error compilando ${platform_name}"
        return 1
    fi
    echo ""
}

# Compilar para cada plataforma
echo "🍎 === COMPILANDO PARA macOS (Intel) ==="
build_platform "mac" "macOS (Intel)" "🍎"

echo "🪟 === COMPILANDO PARA WINDOWS ==="
build_platform "win" "Windows" "🪟"

echo "🐧 === COMPILANDO PARA LINUX ==="
build_platform "linux" "Linux" "🐧"

echo "🎉 ¡Compilación completada!"
echo ""

# Mostrar resumen de archivos generados
if [ -d "dist" ]; then
    echo "📊 RESUMEN DE ARCHIVOS GENERADOS:"
    echo "=================================="
    
    echo ""
    echo "🍎 macOS:"
    find dist -name "*.dmg" -o -name "*mac*.zip" | while read file; do
        if [ -f "$file" ]; then
            size=$(du -h "$file" | cut -f1)
            echo "  📦 $(basename "$file") (${size})"
        fi
    done
    
    echo ""
    echo "🪟 Windows:"
    find dist -name "*.exe" -o -name "*win*.zip" | while read file; do
        if [ -f "$file" ]; then
            size=$(du -h "$file" | cut -f1)
            echo "  📦 $(basename "$file") (${size})"
        fi
    done
    
    echo ""
    echo "🐧 Linux:"
    find dist -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*linux*.tar.gz" | while read file; do
        if [ -f "$file" ]; then
            size=$(du -h "$file" | cut -f1)
            echo "  📦 $(basename "$file") (${size})"
        fi
    done
    
    echo ""
    echo "📁 Todos los archivos están en el directorio: dist/"
    echo "💾 Tamaño total del directorio dist:"
    du -sh dist/
else
    echo "⚠️  No se encontró el directorio dist/"
fi

echo ""
echo "✨ ¡Listo! Tus ejecutables están disponibles para distribución."