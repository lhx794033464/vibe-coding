#!/bin/bash
# 构建流程图 MCP 技能（单文件打包）

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "Bundling with esbuild..."
npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=dist/flowchart-mcp.js \
  --banner:js='#!/usr/bin/env node' \
  --external:fs \
  --external:path \
  --external:process \
  --external:events \
  --external:stream \
  --external:util \
  --external:string_decoder

chmod +x dist/flowchart-mcp.js

echo "Build complete! Output: dist/flowchart-mcp.js"
echo "File size: $(ls -lh dist/flowchart-mcp.js | awk '{print $5}')"
