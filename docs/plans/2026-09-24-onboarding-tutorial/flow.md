# Flow

What each onboarding step shows and when it is complete. Back to [index](index.md).

| # | Step | Shows | Complete when | Saves |
|---|---|---|---|---|
| 1 | **Welcome** | "Welcome to Typelite" and three permission rows, each with a **Grant** button and live status: Microphone, Accessibility (typing into other apps, global shortcuts), Automation (controlling System Events for paste and app detection). | All three are granted. A small "Skip for now" is allowed. | – |
| 2 | **Voice input** | The microphone picker with a live level meter. | A device is chosen (system default counts). | `input_device` |
| 3 | **Speech recognition** | Speech preset picker and **Test**. | Test passes. | active speech preset |
| 4 | **AI model** | AI preset picker and **Test**. | Test passes. | active AI preset |
| 5 | **Dictate shortcut** | Record the shortcut by pressing keys (default Fn). Then a practice text box: "Press your shortcut, say a sentence, press it again." The capsule appears as in real use. | A dictation has been pasted into the practice box. | Dictate binding |
| 6 | **Translate shortcut** | Record the shortcut (default Fn + Shift) and pick one target language. Then the same practice box. | A translation has been pasted. | Translate binding, target language |
| 7 | **Ask anything shortcut** | Record the shortcut (default Fn + Space). Then "Ask a question out loud." | An answer has appeared. The last button is **Finish**. | Ask binding |

## Behaviour notes

- Defaults follow Typeless: Dictate `Fn`, Translate `Fn + Shift`, Ask anything `Fn + Space`.
  Users without an Fn key (external keyboards) record their own keys in steps 5–7.

- Shortcuts must be live during steps 5–7, so the user can press them while onboarding is open.
- Pressing Back keeps what was already saved.
- If a test fails (server down), the step shows the error and a retry; it never leaves the user
  stuck without a way back.
