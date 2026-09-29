#!/usr/bin/env bash
# Builds the installer DMG from an already built Typelite.app, with the drag-to-Applications
# window (scripts/dmg-settings.py). Needs Python 3; dmgbuild (BSD licence) is installed into a
# throwaway virtual environment.
#
#   bash scripts/build-dmg.sh <path to Typelite.app> <output .dmg>
set -euo pipefail

app="${1:?usage: build-dmg.sh <Typelite.app> <output.dmg>}"
out="${2:?usage: build-dmg.sh <Typelite.app> <output.dmg>}"
here="$(cd "$(dirname "$0")" && pwd)"
venv="${TMPDIR:-/tmp}/typelite-dmgbuild"

if [ ! -x "$venv/bin/dmgbuild" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --quiet "dmgbuild==1.6.5"
fi

rm -f "$out"
"$venv/bin/dmgbuild" -s "$here/dmg-settings.py" -D app="$app" -D root="$(dirname "$here")" "Typelite" "$out"
echo "Wrote $out"
