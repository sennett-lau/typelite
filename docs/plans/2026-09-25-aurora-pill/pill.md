# Pill

Back to [index](index.md).

## States and sizes (window padding of 12 pt per side is extra)

| State | Content | Width × height |
|---|---|---|
| Recording (Dictate) | red dot, 18-bar waveform, cancel button | ≈ 150 × 36 |
| Recording (Translate) | dot, waveform, three language chips, cancel | ≈ 232 × 36 |
| Recording (Ask) | Ask icon, waveform, cancel | ≈ 150 × 36 |
| Transcribing / Polishing / Pasting | label ("Listening…" is not used; "Transcribing", "Polishing", "Pasting") over the aurora sweep | ≈ 132 × 36 |
| Error | icon and one line, as today | as today |

Exact widths come from the content; the numbers are targets. The left-edge anchoring from
`useCapsuleResize` stays, so the pill does not jump sideways between states.

## Aurora animation

- **Recording:** inside the dark glass, two blurred colour blobs (teal `#3fd8c2` and violet
  `#af52de` in dark mode; blue `#0a84ff` and violet `#af52de` in light mode) drift slowly
  (8–12 s loop) at about 35 % opacity. Blob brightness rises a little with the voice level, so
  the glow breathes with speech. Waveform bars use a teal→violet (or blue→violet) gradient.
- **Working states:** a soft band of the same gradient sweeps left to right across the pill
  every ~1.4 s; the label stays white and readable on top.
- **Done:** a brief teal (or blue) flash, then the pill hides.
- Implemented with CSS gradients, `filter: blur`, `transform` and `opacity` only (GPU friendly),
  one `requestAnimationFrame` loop for the level-driven brightness.
- `prefers-reduced-motion`: gradients are static; no drift, sweep or breathing.
