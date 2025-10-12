#!/bin/bash

# Quick build script - just Next.js build with native module rebuild
# Use this for faster iteration during development

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Quick Build (Next.js only)${NC}"
echo ""

# Step 1: Rebuild native modules
echo -e "${YELLOW}Step 1/2: Rebuilding native modules...${NC}"
bash scripts/rebuild-native.sh
echo ""

# Step 2: Build Next.js
echo -e "${YELLOW}Step 2/2: Building Next.js...${NC}"
pnpm run build:next

echo ""
echo -e "${GREEN}✅ Quick build completed!${NC}"
echo "Run 'pnpm start' to test the production build"
