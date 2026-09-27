# Qwen3-ASR support

Qwen3-ASR is an open speech model (Apache-2.0) that writes Cantonese as it is spoken and keeps
English words in English, where whisper rewrites Cantonese into formal written Chinese. It runs on
llama.cpp's `llama-server` (the same C++ runtime family as whisper.cpp) and on vLLM, both with an
OpenAI-compatible `/v1/audio/transcriptions` endpoint. Two things in its answers do not fit
Typelite today: every transcript starts with a language tag (`language Cantonese<asr_text>…`),
and Chinese comes back in Simplified characters. Typelite removes the tag, uses it as the detected
language, and writes the transcript in the characters of the Chinese language the language router
picks, so a Qwen3-ASR server works as an ordinary speech preset with no helper program.

Status: building — 2026-09-27

## Goals

- A stock `llama-server` or vLLM serving Qwen3-ASR works as an OpenAI-compatible speech preset:
  no adapter script, no Python on the user's side.
- The language in the tag feeds the language router like `verbose_json`'s `language` field.
- A Qwen3-ASR dictation routed to Cantonese (Hong Kong) is written in Hong Kong Traditional
  characters, with Cantonese 係 and 覆 where the converter cannot tell; Taiwan and Simplified
  Chinese languages get their own characters. This also holds with AI polish off.
- Nothing changes for other speech engines, including Qwen Cloud (plan `qwen-cloud-speech`).
- Deterministic, offline conversion: no model involved, nothing sent anywhere.

## Non-goals

- A Built-in Qwen3-ASR option. The bundled `llama-server` already runs it (tested), so this is
  the natural next plan, not part of this one.
- Changing how languages are routed. The script follows the router's existing decision.
- Converting between Traditional variants or rewriting vocabulary (軟件 ↔ 軟體). Only characters
  change, not words.

## Key decisions

| Decision | Reason |
|---|---|
| Strip `language <Name><asr_text>` at the start of any OpenAI-compatible answer | Both llama.cpp and vLLM send it; no other server's text starts that way, so it is safe for all. |
| The tag's language fills in the detected language only when the answer has no `language` field | A server's own field stays authoritative. |
| The script follows the Chinese language the router picked for the dictation (`zh-Hant-HK` → Hong Kong Traditional, `zh-Hant-TW` → Taiwan, `zh-Hans` → Simplified) | One rule the user already sees: the language whose notes apply also decides its characters. A Mandarin dictation is not converted just because Cantonese is in the list. |
| Nothing is converted when no Chinese language is picked | Keeps today's behaviour for everyone who does not use language routing. |
| Only Qwen3-ASR answers (the tag was present) are converted; Built-in whisper, whisper servers and Qwen Cloud keep their script | Plan `qwen-cloud-speech` left Qwen Cloud's Simplified Cantonese to a polish setting on purpose; other engines already write the script their users chose. |
| Convert with `ferrous-opencc` (pure Rust, Apache-2.0, OpenCC's dictionaries built in) | Same results as OpenCC; no C++ library, no files to ship; the licence fits MIT and the no-GPL rule. |
| Cantonese fixes after the Hong Kong conversion: 系/繫 → 係 outside words such as 系統, 關係; 復 → 覆 before 你 佢 我 返 個 | OpenCC maps characters for written Chinese; Cantonese 係 ("is") and 覆 ("reply") need the context it lacks. |
| Convert right after speech recognition, before voice intents, polish and paste | Every path sees the same text, including polish off. |
| The log records the route and whether text was converted, never the text | Same rule as every other log line. |

## Considered

- **A Python adapter in front of the server** (tried first). Works, but every user has to run
  and maintain a second program; the fix belongs in the app.
- **Our own server in C++ or Rust.** llama.cpp already serves the model; a second runtime would
  add nothing.
- **Leaving the script to AI polish** (the `polish_chinese_script` prompt rule). A 4B model
  converts unreliably, cannot tell 係 from 系, and does nothing with polish off.
- **A per-preset "Chinese characters" setting.** More UI for the same result; the router already
  knows the language.

## Parts

This plan has no part files; the decisions above are the whole design. Code:
`stt/transcript.rs` (tag), `stt/chinese_script.rs` (conversion), `stt/whisper_compat.rs`
(answer parsing) and the transcript step in `pipeline.rs`.

## Open questions

- A Built-in Qwen3-ASR speech option on the bundled `llama-server` (GGUF from
  `ggml-org/Qwen3-ASR-1.7B-GGUF`, about 2.5 GB with its audio encoder).
- Languages on their built-in instructions have no recognition hints, so the router (and with it
  the script) does not pick them; users need the language preset. The open question in plan
  `language-prompt-library` about embedding official presets as the built-in defaults would fix
  this too.
