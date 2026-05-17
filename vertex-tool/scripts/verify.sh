#!/usr/bin/env bash
# Smoke-test the installation in a throwaway venv (no network needed).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHEEL_DIR="${ROOT_DIR}/wheels"
VENV_DIR="${VENV_DIR:-/tmp/claude-vertex-verify-venv}"

rm -rf "${VENV_DIR}"
python3 -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

python -m pip install --quiet --upgrade --no-index --find-links "${WHEEL_DIR}" pip || true
python -m pip install --no-index --find-links "${WHEEL_DIR}" claude-vertex-tool

python - <<'PY'
import claude_vertex_tool, anthropic
print("claude_vertex_tool:", claude_vertex_tool.__version__)
print("anthropic:", anthropic.__version__)
from anthropic import AnthropicVertex
print("AnthropicVertex importable:", AnthropicVertex is not None)
from claude_vertex_tool import ClaudeVertexClient
print("ClaudeVertexClient importable:", ClaudeVertexClient is not None)
PY

claude-vertex --help >/dev/null
echo "OK: package installed and CLI is callable."
