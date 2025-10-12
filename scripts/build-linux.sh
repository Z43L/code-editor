#!/bin/bash

# Build script for Linux platform
set -e

echo "🐧 Building for Linux..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Rebuild native modules
echo -e "${YELLOW}Step 1/3: Rebuilding native modules...${NC}"
bash scripts/rebuild-native.sh

# Step 2: Build Next.js application (use build:next to avoid recursion)
echo -e "${YELLOW}Step 2/3: Building Next.js application...${NC}"
pnpm run build:next

# Step 3: Build Electron app for Linux
echo -e "${YELLOW}Step 3/3: Building Electron application for Linux...${NC}"
electron-builder --linux

echo -e "${GREEN}✅ Linux build completed successfully!${NC}"
echo -e "${GREEN}Output directory: dist/${NC}"
