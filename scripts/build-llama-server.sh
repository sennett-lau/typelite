#!/usr/bin/env bash
# Builds llama.cpp's `llama-server` for Typelite's Built-in AI (plan `ai-polish-setup`).
#
# The binary is built from source at one pinned llama.cpp release, with Metal on and the Metal
# shaders embedded, linked statically (no libllama/libggml dylibs, no OpenSSL, no curl), so the
# one file runs on its own inside Typelite.app. It is written to
#
#   src-tauri/binaries/llama-server-<target-triple>
#
# which is git-ignored. `npm run build:app` bundles it as an external binary (it adds
# `src-tauri/tauri.bundle.conf.json`; see docs/plans/2026-09-25-ai-polish-setup/builtin-ai.md).
#
# Options (environment variables):
#   LLAMA_CPP_TAG=b11177   llama.cpp release tag to build (change it only on purpose).
#   LLAMA_BUILD_DIR=...    Where the source and cmake build go (default: src-tauri/target/llama.cpp).
#   JOBS=N                 Parallel compile jobs (default: number of CPU cores).
#
# Usage:
#   bash scripts/build-llama-server.sh
set -euo pipefail

LLAMA_CPP_TAG="${LLAMA_CPP_TAG:-b11177}"
LLAMA_CPP_REPO="https://github.com/ggml-org/llama.cpp"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_ROOT="${LLAMA_BUILD_DIR:-$ROOT/src-tauri/target/llama.cpp}"
SRC="$BUILD_ROOT/src-$LLAMA_CPP_TAG"
BUILD="$BUILD_ROOT/build-$LLAMA_CPP_TAG"
OUT_DIR="$ROOT/src-tauri/binaries"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || echo 4)}"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "Built-in AI is macOS only for now."
command -v cmake >/dev/null || fail "cmake is required (brew install cmake)."
command -v git >/dev/null || fail "git is required."

# Tauri looks for `<name>-<target-triple>`; use the triple Rust builds for.
TRIPLE="$(rustc -vV 2>/dev/null | sed -n 's/^host: //p')"
[[ -n "$TRIPLE" ]] || TRIPLE="$(uname -m | sed 's/arm64/aarch64/')-apple-darwin"
[[ "$TRIPLE" == aarch64-apple-darwin ]] || say "Warning: $TRIPLE is not Apple Silicon; Built-in AI is only offered on Apple Silicon."

if [[ ! -d "$SRC/.git" ]]; then
  say "Fetching llama.cpp $LLAMA_CPP_TAG"
  mkdir -p "$BUILD_ROOT"
  git clone --quiet --depth 1 --branch "$LLAMA_CPP_TAG" -c advice.detachedHead=false \
    "$LLAMA_CPP_REPO" "$SRC"
fi

say "Configuring (Metal on, shaders embedded, static, no OpenSSL)"
cmake -S "$SRC" -B "$BUILD" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.3 \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_METAL=ON \
  -DGGML_METAL_EMBED_LIBRARY=ON \
  -DGGML_NATIVE=OFF \
  -DLLAMA_BUILD_COMMON=ON \
  -DLLAMA_BUILD_TOOLS=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_APP=OFF \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_OPENSSL=OFF \
  -DLLAMA_LLGUIDANCE=OFF \
  >/dev/null

say "Building llama-server ($JOBS jobs; this takes a few minutes)"
cmake --build "$BUILD" --config Release --target llama-server -j "$JOBS" >/dev/null

BIN="$BUILD/bin/llama-server"
[[ -x "$BIN" ]] || fail "The build finished but $BIN is missing."

# Only system libraries and frameworks may be linked; anything else would be missing on
# another Mac.
if otool -L "$BIN" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/usr/lib/|/System/Library/)' ; then
  fail "llama-server links a library outside /usr/lib and /System (listed above)."
fi

mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/llama-server-$TRIPLE"
cp "$BIN" "$OUT"
strip -x "$OUT" 2>/dev/null || true
chmod 755 "$OUT"

say "Checking the binary"
"$OUT" --version 2>&1 | head -n 2

say "Done: $OUT ($(du -h "$OUT" | cut -f1))"
