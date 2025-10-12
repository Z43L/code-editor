#!/bin/bash

# Script to rebuild native modules (node-pty) for the current platform
# This ensures compatibility with the current Node.js version

set -e

echo "🔧 Rebuilding native modules..."
echo "Node version: $(node --version)"
echo "Platform: $(uname -s)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to node-pty directory
cd node_modules/node-pty

echo -e "${YELLOW}Cleaning previous build...${NC}"
rm -rf build

echo -e "${YELLOW}Rebuilding node-pty with node-gyp...${NC}"
node-gyp rebuild

# Create Debug symlink to Release
cd build
if [ ! -L "Debug" ]; then
    echo -e "${YELLOW}Creating Debug -> Release symlink...${NC}"
    ln -sf Release Debug
fi

echo -e "${GREEN}✅ Native modules rebuilt successfully!${NC}"
echo -e "${GREEN}Build directory: $(pwd)${NC}"
ls -la

# Return to project root
cd ../../..

echo -e "${GREEN}✅ All done!${NC}"
