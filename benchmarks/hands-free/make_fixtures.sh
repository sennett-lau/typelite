#!/usr/bin/env bash
# Plan `hands-free-mode` (measurements.md): synthesises the wake-check test set with macOS `say`.
# Writes 16 kHz mono 16-bit WAV files and a manifest (label<TAB>file<TAB>text) into $1.
# Labels: wake (should wake), other (should not wake), talk (long background speech).
set -euo pipefail
out="${1:?usage: make_fixtures.sh <output dir>}"
mkdir -p "$out"
manifest="$out/manifest.tsv"
: > "$manifest"

n=0
add() { # label voice text
  local label="$1" voice="$2" text="$3"
  n=$((n + 1))
  local file
  file=$(printf '%03d-%s.wav' "$n" "$label")
  say -v "$voice" -o "$out/$file" --data-format=LEI16@16000 "$text"
  printf '%s\t%s\t%s\t%s\n' "$label" "$file" "$voice" "$text" >> "$manifest"
}

en_voices=("Samantha" "Daniel" "Karen" "Moira" "Rishi" "Tessa" "Reed (English (US))" "Shelley (English (US))")

for voice in "${en_voices[@]}"; do
  add wake "$voice" "Hey Sam."
  add wake "$voice" "Hey, Sam!"
  add wake "$voice" "Hey Sam, what's the weather like today?"
  add other "$voice" "Hey Pam."
  add other "$voice" "Same here, thanks."
  add other "$voice" "Hey man, how are you?"
  add other "$voice" "I saw Sam yesterday at the station."
  add other "$voice" "Thank you."
done
for voice in "Tingting" "Meijia" "Sinji"; do
  add wake "$voice" "嘿 Sam"
  add other "$voice" "我们明天下午三点开会。"
done
add other "Sinji" "今晚我哋去邊度食飯？"
add other "Samantha" "Okay, so the meeting moved to Thursday afternoon."
add other "Daniel" "Hey Siri."
add other "Karen" "Hey Tom, can you pass me that?"

# About a minute of continuous background talk (a podcast or a colleague on a call).
add talk "Samantha" "So yesterday we went over the quarterly numbers, and honestly they look better than \
expected. Sales in the northern region grew by about twelve percent, mostly thanks to the new \
partnership. Marketing wants to double the budget for the spring campaign, but finance is not \
convinced yet. Sam from engineering said the release is on track, although the testing team still \
needs another week. Then we talked about hiring. We have three open roles, and the interviews \
start next Monday. Somebody asked whether we could move the offsite to June, and everyone \
agreed that the weather would be nicer. After that, the discussion drifted to the coffee machine, \
which has been broken for two weeks now. Hey, at least the snacks are good. Same time next week?"
add talk "Tingting" "昨天我们开了一个很长的会议，讨论了下个季度的计划。销售部门说北方地区的业绩增长了百分之十二，\
市场部希望增加春季活动的预算，但是财务部门还没有同意。工程部的同事说新版本的进度正常，不过测试团队还需要一个星期。\
然后我们讨论了招聘的问题，现在有三个职位空缺，面试从下星期一开始。"
echo "Wrote $n files to $out"
