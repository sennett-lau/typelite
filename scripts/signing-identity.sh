#!/usr/bin/env bash
# Prints the code-signing identity for a local build: "Typelite Signing" when that
# certificate is in the keychain (see docs/releasing.md, "Signing"), else "-" (ad hoc).
#
# One stable certificate keeps macOS's Accessibility and Microphone grants across builds:
# the grant is tied to the signer, not to one build's hash. Without it every build needs
# `tccutil reset Accessibility <bundle id>` and a new grant.
set -euo pipefail
IDENTITY="Typelite Signing"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
  printf '%s' "$IDENTITY"
else
  printf '%s' "-"
fi
