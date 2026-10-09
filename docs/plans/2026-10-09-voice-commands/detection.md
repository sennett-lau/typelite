# Detection

How an Ask utterance becomes a command, or stays a question. Part of
[voice-commands](index.md). Code: `src-tauri/src/voice_commands/patterns.rs` and `ai.rs`.

## Order

```
transcript ──selection? ──yes──> normal Ask
     │no
     ▼
 patterns ──NotCommand──> normal Ask
     │Command(action, target)          │Maybe
     ▼                                 ▼
 resolve target ──unknown app──> AI ──none──> normal Ask
     │found                       │command
     ▼                            ▼
 execute / confirm / message   resolve, then execute or message
```

## Guards (before any pattern)

- Longer than 80 characters, or several lines: not a command.
- A negation anywhere ("don't", 唔好, 不要, ないで, "no", "ne/n'", "nicht"): not a command.
- Ends with a question mark: not a command, unless it starts with a polite request ("can you",
  "could you", 可唔可以, 可不可以, "peux-tu", "puedes", "kannst du").
- Filler words around the verb are dropped (please, 幫我, 唔該, 請, por favor, bitte, ください, 吧,
  啦, 嗎).

## Patterns

- Verb before the target: English (open, launch, start, switch to, go to, hide, quit, close, run
  shortcut), Spanish (abre, cambia a, oculta, cierra), French (ouvre, lance, passe à, masque,
  quitte, ferme), German (öffne, starte, wechsle zu, beende, schließe), Chinese and Cantonese
  (打開, 開, 開啟, 啟動, 切換到, 轉去, 隱藏, 收埋, 關閉, 退出, 閂, with Simplified forms).
- Verb after the target: Japanese (を開いて, を起動して, に切り替えて, を隠して, を終了して,
  を閉じて) and German infinitives (Safari öffnen, beenden).
- German verbs around the target: "mach Safari auf", "blende Spotify aus".
- One-character Chinese verbs (開, 關) are skipped before characters that make a common word
  (開心, 開會, 關於).
- The target loses articles and words like "app", "folder", 一下, アプリ. It has at most five
  words and 40 characters.
- A target that looks like a web address ("github.com", "github dot com", an http(s) link)
  becomes `open_url`; a folder name (Downloads, 下載, ダウンロード, Bureau, …) becomes
  `open_folder`.

## When the AI is asked

Only when no pattern decided and the utterance is short (at most ten words): it has a command
hint word in some language, or names an installed app that is not an everyday word ("Slack",
but not "Notes" or "Music"). Also when a pattern matched an app action but the target is not an
installed app. If the AI says "none", Ask answers normally. If the AI is unavailable or slow,
a short target (three words at most) gets "No app called X"; anything longer is a normal Ask.

## The AI request

One non-streaming request, temperature 0, at most 80 output tokens, 4 s timeout, the preset's
extra fields kept (so `reasoning_effort: none` still applies). Seven tools mirror the actions:
`open_app`, `switch_to`, `hide_app`, `quit_app` (`name`), `open_url` (`url`), `open_folder`
(`folder`), `run_shortcut` (`name`). The system prompt also describes the JSON answer for models
without tools. Status 400, 422 or 500 with tools means one retry without them. An unknown tool
name, a missing target or prose is "unreadable" and treated like no AI.

## Considered

- AI for every Ask utterance: one more round trip on every question. Rejected.
- Patterns only: misses natural phrasings; the AI fallback is cheap when gated.
