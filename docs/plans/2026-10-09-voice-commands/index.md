# Voice commands (level 1)

With the Ask anything shortcut, the user says a simple instruction and Typelite carries it out on
the Mac: "open Safari", "switch to Slack", "打開 Spotify", "Safari を開いて". The commands are
open, switch to, hide or quit an app, open a web address, open one of four known folders, or run
a macOS Shortcut by name. There are no screenshots, no reading other apps' interfaces and no
multi-step agent. The feature is off by default (Settings → General → Voice commands).

Status: building (2026-10-09)

## Goals

- Short spoken commands in English, Cantonese, Mandarin, Japanese, Spanish, French and German
  run without the AI, offline and with no extra delay.
- Unusual phrasings ("could you get Slack up for me") still work through the configured AI,
  including the built-in model.
- Never hijack a normal Ask: a question, a negation, a long sentence or a selection keeps the
  current behaviour. An unclear utterance stays a normal Ask.
- Safe by construction: every target is resolved against a closed list (installed apps, four
  folders, the user's Shortcuts, http/https addresses). Quitting asks first.

## Non-goals

- Levels 2 and 3 (see [levels.md](levels.md)).
- Arbitrary shell commands, file paths, or bundles and paths named by the AI.
- Choosing one window of an app by its title (would need Accessibility `AXWindows` + `AXRaise`;
  not reliable enough for level 1).
- Commands from the Dictate or Translate shortcuts.

## Key decisions

- **Through Ask, before intent routing.** Ask already handles "do something" utterances (search,
  draft). The command check runs after the transcript and before `route_ask_intent`, and only
  returns when the utterance is a command. Reason: no new shortcut and no change for questions.
- **Patterns first, AI second.** Deterministic verb patterns per language decide most commands
  in microseconds. The AI runs only for short utterances with a command hint or an app name, or
  when a pattern matched but its target is not an installed app ("open source"). Reason: speed,
  offline use, and no AI call for ordinary questions.
- **Tool calls with a JSON fallback in one request.** The request offers OpenAI-style `tools`;
  the same system prompt tells a model without tools to answer `{"action","target"}`. A server
  that rejects `tools` is asked again without them. Reason: works with cloud servers, llama.cpp
  with or without Jinja, and Ollama.
- **Resolve, never trust.** App names are matched against bundles in `/Applications`,
  `/System/Applications` (with `Utilities`) and `~/Applications`: exact name, localized Finder
  name, a small alias list, then prefix/substring and a small edit distance. Two equal matches
  are ambiguous and listed, not guessed.
- **Quit needs Confirm.** A token kept in memory for 60 s; Confirm uses it once. Cancel, ✕,
  Escape and a new Ask run drop it. Reason: quitting is the only action that can lose work.
- **The pill shows what happens.** "Opening Safari" for about a second while the app comes
  forward; only failures and the quit question open the Ask panel. The panel stays
  non-activating; the target app taking focus is the point of the command.
- **Privacy.** The log gets the action, outcome, source (patterns or AI) and timing; never the
  utterance or the target. Nothing is stored.

## Parts

| File | Covers |
|---|---|
| [detection.md](detection.md) | Patterns per language, guards, when the AI is asked, the AI request |
| [execution.md](execution.md) | App resolution, the macOS calls, quit confirmation, URL and folder rules |
| [ux.md](ux.md) | Pill, Ask panel messages, settings, strings |
| [levels.md](levels.md) | Levels 1 to 3 of computer control, and what is out of scope |

## Open questions

- Should "switch to" accept a window title ("switch to the Typelite pull request") once an
  Accessibility path is proven reliable?
- Is the 4 s AI timeout right for the built-in model on slower Macs?
- Conflicts expected with open PRs that change the Ask result struct and `AskAnswerPanel`
  (#79, #80, #83): one field and one branch each; resolve by keeping both.
