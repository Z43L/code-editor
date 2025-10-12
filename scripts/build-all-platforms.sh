#!/bin/bash

# Universal build script for all platforms
# Detects the current platform and builds accordingly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}   Multi-Platform Build Script${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# Detect platform
PLATFORM=$(uname -s)
echo "Detected platform: $PLATFORM"
echo "Node version: $(node --version)"
echo ""

# Step 1: Rebuild native modules for current platform
echo -e "${YELLOW}━━━ Step 1/3: Rebuilding native modules ━━━${NC}"
bash scripts/rebuild-native.sh
echo ""

# Step 2: Build Next.js application
echo -e "${YELLOW}━━━ Step 2/3: Building Next.js application ━━━${NC}"
pnpm run build:next
echo ""

# Step 3: Build Electron application based on platform
echo -e "${YELLOW}━━━ Step 3/3: Building Electron application ━━━${NC}"

case "$PLATFORM" in
    Linux*)
        echo "Building for Linux..."
        electron-builder --linux
        ;;
    Darwin*)
        echo "Building for macOS..."
        electron-builder --mac
        ;;
    MINGW*|MSYS*|CYGWIN*)
        echo "Building for Windows..."
        electron-builder --win
        ;;
    *)
        echo -e "${RED}Unknown platform: $PLATFORM${NC}"
        echo "Defaulting to Next.js build only (no Electron packaging)"
        ;;
esac

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}   ✅ Build completed successfully!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Output directory: dist/"
ls -lh dist/ 2>/dev/null || echo "No dist directory found (Next.js build only)"
