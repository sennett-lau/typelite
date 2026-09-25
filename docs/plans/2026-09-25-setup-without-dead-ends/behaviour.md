# Behaviour

Back to [index](index.md).

## Onboarding

- **Welcome** content is centred vertically in the step area.
- **Speech recognition** and **AI Polish Service** steps show the preset picker plus editable
  base URL, model, (speech) language and optional API key, and Test. "Save as new preset" works
  here as in Settings. Next needs a passing Test; "Skip for now" always works.
- Each of the two steps has a "How to set this up" link that expands an in-app guide card:
  the options (this Mac, another computer on the network, a cloud service with your own key),
  the key steps with copy buttons, and "Open full guide" linking to the guide in the repository.
- After step 4: if both services passed a test, continue to the shortcut steps. Otherwise
  finish onboarding and go to Home.

## Built-in presets (templates)

| Preset | Type | Base URL | Model |
|---|---|---|---|
| whisper.cpp on this Mac | Speech | `http://127.0.0.1:8178/v1` | `large-v3-turbo` |
| Speech server on another computer | Speech | `http://<computer-ip>:8000/v1` | `Systran/faster-whisper-large-v3` |
| OpenAI (your key) | Speech | `https://api.openai.com/v1` | `whisper-1` |
| Groq (your key) | Speech | `https://api.groq.com/openai/v1` | `whisper-large-v3-turbo` |
| Ollama on this Mac | AI | `http://127.0.0.1:11434/v1` | `qwen3:4b-instruct-2507-q4_K_M` |
| Ollama on another computer | AI | `http://<computer-ip>:11434/v1` | `qwen3:4b-instruct-2507-q4_K_M` |
| OpenAI (your key) | AI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq (your key) | AI | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` |

Placeholders like `<computer-ip>` fail Test with a message asking the user to replace them.

## Missing services

- A service counts as **ready** once its active preset has passed a Test (or a real request)
  since it was last changed. This flag is stored per preset id; nothing about dictations is
  stored.
- Speech not ready: Dictate, Translate and Ask show the capsule error "Set up speech recognition
  first" with a button that opens Settings → Speech.
- AI not ready: Dictate still works and pastes the raw transcript (AI cleanup is skipped);
  Translate and Ask show "Set up the AI polish service first".
- Home shows a "Finish setup" card at the top for each service that is not ready, with its
  status and a "Set up" button to the right Settings tab.

## Tutorial prompt

- The first time both services are ready and the shortcut tutorial has not been completed, a
  dialog asks "Speech and AI are ready. Try the three shortcuts now?" with "Start" (opens
  onboarding at the Dictate step) and "Later". "Later" hides it; Home keeps a small "Take the
  shortcut tour" link until the tour is done.
