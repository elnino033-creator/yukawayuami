#!/usr/bin/env bash
# Offline install for claude-vertex-tool.
# Run this on the Vertex AI Workbench instance after copying the bundle in.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHEEL_DIR="${ROOT_DIR}/wheels"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [[ ! -d "${WHEEL_DIR}" ]]; then
  echo "error: wheel directory not found: ${WHEEL_DIR}" >&2
  exit 1
fi

echo "[1/2] Installing wheels from ${WHEEL_DIR} ..."
"${PYTHON_BIN}" -m pip install \
  --no-index \
  --find-links "${WHEEL_DIR}" \
  --upgrade \
  claude-vertex-tool

echo "[2/2] Verifying installation ..."
"${PYTHON_BIN}" - <<'PY'
import importlib
mod = importlib.import_module("claude_vertex_tool")
print(f"claude_vertex_tool version: {mod.__version__}")
import anthropic
print(f"anthropic version: {anthropic.__version__}")
PY

cat <<'EOF'

Done.

Next steps:
  1. Set the GCP project (Workbench usually exposes it automatically):
       export ANTHROPIC_VERTEX_PROJECT_ID="your-gcp-project"
       export CLOUD_ML_REGION="us-east5"
  2. Try the CLI:
       claude-vertex "hello in one sentence"
  3. Or use it from Python / Jupyter:
       from claude_vertex_tool import ClaudeVertexClient
       client = ClaudeVertexClient()
       print(client.send("hello"))
EOF
