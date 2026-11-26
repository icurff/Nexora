#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT"

export NEXORA_MODEL_DIR="$ROOT/ai/artifacts/lightgcn_catalog500"

if [[ ! -f "$NEXORA_MODEL_DIR/selected_model_for_serving.json" ]]; then
    echo "ERROR: Catalog500 artifacts not found"
    exit 1
fi

echo "Starting Nexora Catalog500"
echo "Model directory: $NEXORA_MODEL_DIR"

exec python -m uvicorn ai.src.serving.main:app \
    --host 127.0.0.1 \
    --port 8000
