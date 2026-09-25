#!/usr/bin/env bash
# Runs Typelite's end-to-end checks against real speech and AI servers.
#
#   bash scripts/e2e.sh                  # speech on this Mac, AI on this Mac
#   TYPELITE_E2E_AI_URL=http://<ip>:11434/v1 bash scripts/e2e.sh
#
# See src-tauri/tests/e2e_services.rs for every variable. Tests print timings for each step.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Optional machine-specific servers, e.g. TYPELITE_E2E_AI_URL=http://<ip>:11434/v1.
# `.env.e2e` is git-ignored, so private addresses stay on this machine.
if [[ -f "$ROOT/.env.e2e" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.e2e"
  set +a
fi
cd "$ROOT/src-tauri"
exec cargo test --test e2e_services -- --ignored --nocapture --test-threads=1 "$@"
