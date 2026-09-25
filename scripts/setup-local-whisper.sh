#!/usr/bin/env bash
# Sets up a local speech-recognition server for Typelite on macOS.
#
# What it does:
#   1. Installs whisper.cpp from Homebrew (the official formula).
#   2. Downloads a Whisper model from the official whisper.cpp Hugging Face repository and
#      checks its SHA-256.
#   3. Runs `whisper-server` as a login item (LaunchAgent) with an OpenAI-compatible endpoint.
#   4. Sends a short test request.
#
# Options (environment variables):
#   PORT=8178          Port to listen on.
#   HOST=127.0.0.1     Use HOST=0.0.0.0 to let other computers on your network use it.
#   MODEL=large-v3-turbo-q5_0   Model file suffix (see MODELS below).
#
# Usage:
#   bash scripts/setup-local-whisper.sh            install or update
#   bash scripts/setup-local-whisper.sh --uninstall  stop the server and remove the login item
set -euo pipefail

PORT="${PORT:-8178}"
HOST="${HOST:-127.0.0.1}"
MODEL="${MODEL:-large-v3-turbo-q5_0}"
LABEL="dev.typelite.whisper-server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
MODEL_DIR="$HOME/.local/share/whisper"
LOG="$HOME/Library/Logs/typelite-whisper-server.log"
HF_BASE="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

# Known-good SHA-256 values for the models we suggest. Other models are verified against the
# checksum Hugging Face reports for the file.
declare -a MODELS=(
  "large-v3-turbo-q5_0:394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
)

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

uninstall() {
  say "Stopping $LABEL"
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  say "Removed the login item. The model stays in $MODEL_DIR; delete it yourself if you like."
  exit 0
}

[[ "${1:-}" == "--uninstall" ]] && uninstall
[[ "$(uname -s)" == "Darwin" ]] || fail "This script is for macOS. See docs/guides/speech-recognition.md for other systems."
command -v brew >/dev/null || fail "Homebrew is required. Install it from https://brew.sh and run this script again."

say "Installing whisper.cpp with Homebrew"
brew install whisper-cpp >/dev/null
SERVER="$(brew --prefix)/bin/whisper-server"
[[ -x "$SERVER" ]] || fail "whisper-server was not found at $SERVER"

FILE="ggml-$MODEL.bin"
mkdir -p "$MODEL_DIR"
if [[ ! -f "$MODEL_DIR/$FILE" ]]; then
  say "Downloading $FILE from Hugging Face"
  curl -fL --progress-bar -o "$MODEL_DIR/$FILE.part" "$HF_BASE/$FILE"
  mv "$MODEL_DIR/$FILE.part" "$MODEL_DIR/$FILE"
fi

EXPECTED=""
for entry in "${MODELS[@]}"; do
  [[ "${entry%%:*}" == "$MODEL" ]] && EXPECTED="${entry#*:}"
done
if [[ -z "$EXPECTED" ]]; then
  EXPECTED="$(curl -fsSI "$HF_BASE/$FILE" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-linked-etag"{gsub(/"/,"",$2); print $2}')"
fi
ACTUAL="$(shasum -a 256 "$MODEL_DIR/$FILE" | awk '{print $1}')"
[[ -n "$EXPECTED" && "$ACTUAL" == "$EXPECTED" ]] || {
  rm -f "$MODEL_DIR/$FILE"
  fail "Checksum mismatch for $FILE (expected $EXPECTED, got $ACTUAL). The file was deleted; run the script again."
}
say "Model checksum OK"

say "Creating login item $LABEL"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SERVER</string>
    <string>-m</string><string>$MODEL_DIR/$FILE</string>
    <string>--host</string><string>$HOST</string>
    <string>--port</string><string>$PORT</string>
    <string>--inference-path</string><string>/v1/audio/transcriptions</string>
    <string>-l</string><string>auto</string>
    <string>-bo</string><string>1</string>
    <string>-bs</string><string>1</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

say "Waiting for the server to load the model"
for _ in $(seq 1 60); do
  curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break
  sleep 1
done
curl -fs -o /dev/null "http://127.0.0.1:$PORT/" || fail "The server did not start. Check $LOG"

TMP_WAV="$(mktemp -t typelite-test).wav"
python3 - "$TMP_WAV" <<'PYEOF'
import sys, wave
w = wave.open(sys.argv[1], "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
w.writeframes(b"\x00\x00" * 1600); w.close()
PYEOF
TIME="$(curl -fs -o /dev/null -w '%{time_total}' "http://127.0.0.1:$PORT/v1/audio/transcriptions" -F model=whisper -F "file=@$TMP_WAV")" \
  || fail "The test request failed. Check $LOG"
rm -f "$TMP_WAV"

say "Done. Test request took ${TIME}s."
echo
echo "In Typelite, choose the speech preset \"whisper.cpp on this Mac\" (or use these values):"
echo "  Base URL: http://127.0.0.1:$PORT/v1"
echo "  Model:    large-v3-turbo"
echo "  Language: Auto"
if [[ "$HOST" != "127.0.0.1" ]]; then
  echo
  echo "Other computers can use http://$(ipconfig getifaddr en0 2>/dev/null || echo '<this-mac-ip>'):$PORT/v1"
fi
