# Shortcut gate during onboarding

Until onboarding is finished, Typelite's shortcuts do nothing and the pill never shows, even
when a saved config from an earlier install already has working services. The only exceptions
are the tutorial's shortcut exercises, where exactly the shortcut being taught works. The
frontend tells the backend which roles the current onboarding page allows; the backend enforces
it where shortcuts are dispatched, and starts closed when onboarding is not finished, so nothing
slips through before the window has loaded.

Status: done — 2026-09-26

Refines [onboarding-tutorial](../2026-09-24-onboarding-tutorial/index.md) and
[guided-tutorial](../2026-09-25-guided-tutorial/index.md). Keeps Escape from
[pill-follows-cursor-and-escape](../2026-09-25-pill-follows-cursor-and-escape/index.md) working.

## Goals

- While onboarding is not finished (first run, or the shortcut tour started again from Home or
  the tour prompt), no shortcut starts anything and the pill never shows. This covers every way
  in: the native key listener, global shortcuts, the `typelite toggle` and `typelite ask`
  command-line actions and the tray's Start Recording.
- On a tutorial shortcut page only that page's roles work: Dictate allows Dictation; Translate
  allows Translate and the Switch language key; Ask allows Ask.
- A gated key behaves as if Typelite were not running: it is not swallowed and reaches the
  focused app (End moves the cursor again). A key that is also part of the allowed shortcut
  (End in the user's Ask `End + Right Control`) stays swallowed, as for any live chord. The
  shortcut recorder still captures the key being recorded, as today.
- Escape still cancels a run that is active.
- The design survives the planned tutorial redesign (one page per exercise, separate setup and
  exercise pages): pages say which roles they allow; nothing in the backend knows about steps.

## Non-goals

- Changing what onboarding saves or when it counts as finished.
- Gating the in-window test buttons of the speech and AI steps (they do not use shortcuts or the
  pill).

## Behaviour

| Where the user is | Allowed roles |
|---|---|
| App start, onboarding not finished (before the window loads) | none |
| Welcome, Microphone, Speech, AI pages | none |
| Dictate exercise | `dictation` |
| Translate exercise | `translate`, `switchLanguage` |
| Ask exercise | `ask` |
| Onboarding finished or skipped, tour closed, App start with onboarding finished | all |

Escape (`cancel`) is never gated. A gated press is logged at debug level with its role only.

## Key decisions

| Decision | Reason |
|---|---|
| One backend gate, `All` or a set of allowed roles, set by the command `set_shortcut_gate(allowed: "all" \| role[])` | The frontend knows the page; the backend owns dispatch. Pages of any future layout just send their roles. |
| The startup gate comes from the stored `onboarding_completed` flag: not finished → nothing allowed | Shortcuts are registered at app start, before the webview can say anything. |
| Enforced in `hotkey::handle_hotkey_role_event`, and the CLI and tray paths check the same gate | Every entry point meets one check; nothing depends on the frontend behaving. |
| The native key listener asks the gate on each key press and treats a gated binding as not bound | Only then is the key passed through instead of swallowed. Same technique as the Switch language gate. |
| Global shortcuts (generic modifiers such as `Ctrl+Shift+Space`) are registered only for allowed roles; a gate change re-registers them unless shortcuts are paused for recording | The OS swallows a registered global shortcut; unregistering is the only way to pass it through. Recording resumes with the gate applied. |
| Role names match `HotkeyRole::as_str` (`dictation`, `translate`, `switchLanguage`, `ask`, …); an unknown name is an error | One vocabulary on both sides; a typo must not silently open or close the gate. |
| Finishing or skipping sets `all` after the finished flag is saved; nothing new is stored | The stored flag already gives the right startup gate next launch. |
| A run whose role the new gate does not allow is **cancelled** the same way Escape cancels it | See below. |

### A run that is active when the gate closes

The gate closes on a run only when the user leaves an exercise page while it is still recording
or processing (for example Next during a second try). The run is cancelled exactly like Escape:
recording stops, nothing is pasted, the pill hides without the done flash, and the log says why.

Letting it finish was rejected: the page that would show its result is gone, the result would
paste into whatever has focus (often the onboarding window itself), and in toggle mode the user
could no longer stop the recording with its key, because that key is now gated. Cancel reuses a
path that is already tested and leaves no orphaned state.

## Parts

| File | Covers |
|---|---|
| `index.md` | Everything; the feature is small. |

## Open questions

- None.
