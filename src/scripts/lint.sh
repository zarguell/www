#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -x .venv/bin/ruff ]; then
  .venv/bin/ruff check .
else
  ruff check .
fi
npm run typecheck
