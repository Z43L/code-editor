#!/bin/bash
cd "$(dirname "$0")"
rm -rf node_modules pnpm-lock.yaml package-lock.json
pnpm install || npm install --legacy-peer-deps
