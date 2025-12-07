#!/bin/bash
# Wrapper script to run the headless simulation with proper Node.js loaders

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

NODE_OPTIONS="--loader $SCRIPT_DIR/mp3-loader.mjs --no-warnings" npx tsx "$SCRIPT_DIR/simulate.ts" "$@"
