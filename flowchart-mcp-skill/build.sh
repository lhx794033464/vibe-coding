#!/bin/bash
# 构建流程图 MCP 技能

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "Building..."
npx tsc

# Make bin executable
chmod +x dist/index.js

echo "Build complete! Output: dist/"
