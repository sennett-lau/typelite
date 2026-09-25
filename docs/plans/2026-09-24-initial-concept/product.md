# Product

What the user experiences. Back to [index](index.md).

## Modes and shortcuts

Shortcuts are configurable. Defaults match the user's current setup (their keyboard has no Fn):

| Mode | Default shortcut | Result |
|---|---|---|
| Dictate | `End` | Speech → cleaned text pasted at the cursor. |
| Ask anything | `End + Right Control` | Spoken question → short answer shown near the capsule. |
| Translate | `End + Right Shift` | Speech → text in the target language, pasted at the cursor. |

- Dictate is tap to start, tap to stop. `Esc` cancels and discards the recording.
- The End key is swallowed while it is a shortcut, so it never moves the cursor in the focused app.
- Holding End alone must not fire Dictate when the user is going for a combo: the bare End action
  happens on release, a combo fires as soon as its second key goes down.

## The capsule

A small pill, bottom-centre of the screen under the mouse pointer, 80 pt above the bottom edge.
It never takes keyboard focus. It is hidden when idle.

| State | Shows |
|---|---|
| Recording | Live mic level waveform and elapsed time. |
| Transcribing | Short progress animation. |
| Polishing | Same, with a different tint so the user can tell the steps apart. |
| Done | Brief confirmation, then hides. |
| Error | One-line message (for example "PC unreachable — pasted raw text"). Click to dismiss. |

The capsule's left edge stays fixed while it grows or shrinks, so the mic icon never jumps.

## Flows

**Dictate.** Tap End → capsule appears → speak → tap End → transcribe → polish → paste → the
previous clipboard is restored → capsule hides.

**Ask.** Press the Ask combo → speak → stop → transcribe → send the question to the LLM → the
answer appears in a card next to the capsule with a copy button. Clicking elsewhere dismisses it.

**Translate.** Like Dictate, but the LLM translates instead of cleaning up.

## Feel targets

- The capsule appears within 100 ms of the key press.
- Text appears within about 2 s of stopping, for a sentence or two.
- If the PC is off, dictation still works and pastes the raw transcript.

## Settings (menu-bar item → Settings)

Shortcuts, STT server URL, LLM server URL and model, cleanup style, target language for
Translate, microphone choice, launch at login.
