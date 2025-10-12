#!/bin/bash

echo "🔧 Fixing Electron installation..."

# Change to the project directory
cd /sgoinfre/students/davmoren/editor || exit 1

# Remove node_modules and lockfiles
echo "📦 Removing old node_modules..."
rm -rf node_modules
rm -f pnpm-lock.yaml

# Install with pnpm
echo "📥 Installing dependencies with pnpm..."
pnpm install

# Check if electron installed correctly
if [ -f "node_modules/electron/index.js" ]; then
    echo "✅ Electron installed successfully!"
    echo "🚀 Starting the application..."
    pnpm run electron:start
else
    echo "❌ Electron installation failed. Trying with npm..."
    rm -rf node_modules
    rm -f package-lock.json
    npm install --legacy-peer-deps

    if [ -f "node_modules/electron/index.js" ]; then
        echo "✅ Electron installed with npm!"
        echo "🚀 Starting the application..."
        npm run electron:start
    else
        echo "❌ Installation failed. Please check the logs above."
        exit 1
    fi
fi
