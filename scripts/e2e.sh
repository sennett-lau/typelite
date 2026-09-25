#!/usr/bin/env bash
# Runs Typelite's end-to-end checks against real speech and AI servers.
#
#   bash scripts/e2e.sh                  # speech on this Mac, AI on this Mac
#   TYPELITE_E2E_AI_URL=http://<ip>:11434/v1 bash scripts/e2e.sh
#
# See src-tauri/tests/e2e_services.rs for every variable. Tests print timings for each step.
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"
exec cargo test --test e2e_services -- --ignored --nocapture --test-threads=1 "$@"
