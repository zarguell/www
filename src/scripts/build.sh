#!/usr/bin/env bash
# Workers Builds / local entrypoint. Keeps Python isolated from the base image.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v uv >/dev/null 2>&1; then
  if [ ! -x .venv/bin/python ] || ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
    rm -rf .venv
    uv venv --seed --quiet .venv
  fi
  uv pip install --quiet -r requirements.txt
else
  [ -x .venv/bin/python ] || python3 -m venv .venv
  .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt
fi

if [ ! -x node_modules/.bin/esbuild ]; then
  npm ci --no-audit --no-fund
fi

# Vendor the pure-Python plotly wheel. Renovate bumps requirements-vendor.txt;
# the next build downloads the matching wheel.
VENDOR_DIR=static/assets/python
mkdir -p "$VENDOR_DIR"
PLOTLY_VERSION=$(sed -n 's/^plotly==//p' requirements-vendor.txt | head -1)
WHEEL="$VENDOR_DIR/plotly-${PLOTLY_VERSION}-py3-none-any.whl"
if [ ! -f "$WHEEL" ]; then
  rm -f "$VENDOR_DIR"/plotly-*.whl
  TMP_WHEEL=$(mktemp -d)
  .venv/bin/python -m pip download --quiet --no-deps --only-binary=:all: -d "$TMP_WHEEL" -r requirements-vendor.txt
  cp "$TMP_WHEEL"/plotly-*.whl "$VENDOR_DIR"/
  rm -rf "$TMP_WHEEL"
fi

exec .venv/bin/python build.py "$@"
