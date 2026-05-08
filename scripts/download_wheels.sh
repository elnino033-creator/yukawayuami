#!/usr/bin/env bash
# Re-download dependency wheels for the bundle.
# Run on a workstation WITH internet access. The resulting wheels/ directory
# is what gets copied to the air-gapped Workbench instance.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WHEEL_DIR="${ROOT_DIR}/wheels"
PYTHON_VERSION="${PYTHON_VERSION:-3.10}"
PLATFORM="${PLATFORM:-manylinux2014_x86_64}"

mkdir -p "${WHEEL_DIR}"

echo "Downloading wheels for python ${PYTHON_VERSION} / ${PLATFORM} into ${WHEEL_DIR}"

pip download \
  -r "${ROOT_DIR}/requirements.txt" \
  -d "${WHEEL_DIR}" \
  --python-version "${PYTHON_VERSION}" \
  --platform "${PLATFORM}" \
  --only-binary=:all:

echo
echo "Building local wrapper wheel ..."
pip install --quiet build
python3 -m build --wheel --outdir "${WHEEL_DIR}" "${ROOT_DIR}"
rm -rf "${ROOT_DIR}/build" "${ROOT_DIR}/claude_vertex_tool.egg-info"

echo
echo "Done. Bundle size:"
du -sh "${WHEEL_DIR}"
