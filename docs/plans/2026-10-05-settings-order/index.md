# Settings order

Settings follows the app's three shortcuts. After General, the sections that belong to one
shortcut each come first: Prompts (Dictate), Translate (Translate) and Search (Ask anything).
The services all three share, Speech and AI, come after them, then System. The translation
languages leave Settings → AI and get their own Translate section.

Status: building — 2026-10-05

## Goals

- Prompts and Search come before Speech and AI.
- Translation has its own section, beside the other per-shortcut sections, instead of a group
  inside AI.
- Existing links into Settings (`#/settings?pane=…`, the capsule's "Set up", Home, Finish setup,
  Ask's "Set up web search") keep working.

## Non-goals

- Moving shortcut bindings. Dictate, Translate, Ask anything and Switch language stay together
  in General.
- Changing what any setting does.

## Key decisions

- Order: General → Prompts → Translate → Search → Speech → AI → System. The middle three follow
  the shortcut order (Dictate, Translate, Ask anything), so each shortcut's own settings read in
  the same order as the shortcuts.
- The Translate section holds the translation-language list and its instruction sheets
  unchanged; only its place moves. Reason: the list is about the Translate shortcut, not about
  the AI service.
- Pane ids stay (`stt`, `llm`, `scenes`, `search`); the new pane is `translate`. Reason: old
  links and the Rust `open_settings_pane` command keep working; it accepts `translate` too.
- The Translate shortcut binding stays in General. Reason: all shortcuts are recorded in one
  place, and General is where people look for keys.

## Considered

- General → Prompts → Search → Translate → …: puts Search before Translate, which breaks the
  shortcut order for no gain.
- Keeping Translation under AI: it runs on the AI service, but people think of it as one of the
  three shortcuts.

## Part files

| File | Covers |
|---|---|
| (none) | This plan is small enough for `index.md` alone. |

## Open questions

- None.
