#!/bin/bash

# Script para probar el hot reload de Next.js

echo "🔥 Testing Next.js Hot Reload..."
echo ""

# Verificar si el servidor está corriendo
if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Next.js dev server is running on port 3001"
else
    echo "❌ Next.js dev server is NOT running"
    echo "   Run: pnpm dev"
    exit 1
fi

# Verificar Fast Refresh
echo ""
echo "📝 Testing Fast Refresh..."
echo "   1. Make a change to any .tsx/.ts file"
echo "   2. Save the file"
echo "   3. Check if the browser updates automatically"
echo ""
echo "🔍 Checking Next.js configuration..."

# Verificar archivos de configuración
if [ -f "next.config.mjs" ]; then
    echo "✅ next.config.mjs found"
    if grep -q "reactStrictMode" next.config.mjs; then
        echo "✅ reactStrictMode is enabled"
    else
        echo "⚠️  reactStrictMode not found (should be enabled)"
    fi

    if grep -q "watchOptions" next.config.mjs; then
        echo "✅ webpack watchOptions configured"
    else
        echo "⚠️  webpack watchOptions not configured"
    fi
else
    echo "❌ next.config.mjs not found"
fi

echo ""
echo "📊 Current file watchers:"
lsof -p $(lsof -t -i:3001) 2>/dev/null | grep -E '\.(tsx?|jsx?)$' | wc -l | xargs echo "   Active file watches:"

echo ""
echo "💡 Tips for hot reload issues:"
echo "   - Ensure you're running 'pnpm dev' (not 'pnpm build')"
echo "   - Check browser console for Fast Refresh errors"
echo "   - Verify file changes are being saved"
echo "   - Try clearing .next cache: rm -rf .next"
echo "   - Restart the dev server if issues persist"
