# 0009 — Aurora pill

The capsule gets narrower, drops its time counters, and uses an animated aurora glow in the
app's colours, so it feels alive while listening and working without extra text.

Status: agreed — 2026-09-25

## Goals

- Less to read while talking: no elapsed-time counter while recording or transcribing.
- A smaller pill that covers less of the screen.
- Motion that matches the app: the Aurora teal and violet in dark mode, blue and violet in light
  mode.

## Key decisions

| Decision | Reason |
|---|---|
| Remove the timer while recording and while transcribing/polishing | The user asked; the waveform already shows it is listening. |
| Recording pill ≈ 150 pt: dot, waveform, cancel | Only what is needed. Translate adds its three chips; Ask keeps its icon. |
| Working states (transcribing, polishing, pasting) ≈ 132 pt: a short label over a moving aurora sweep | The sweep shows progress without a spinner or numbers. |
| Aurora = soft teal→violet (dark) or blue→violet (light) gradient light that drifts slowly inside the pill's dark glass; waveform bars use the same gradient | One recognisable motion across the app. |
| Recording limit warning still shows (as text) when a limit is close | That is information the user needs. |
| `prefers-reduced-motion`: static gradient, no drift or sweep | Accessibility. |

## Parts

| File | Covers |
|---|---|
| [pill.md](pill.md) | States, sizes, animation details. |

## Open questions

- None.
