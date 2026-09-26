# Compact pill

Every pill state is 32 pt high instead of 40, with 10.5 pt labels (was 11) and the waveform,
language name and dots, ✕, chips, Copy button and key caps inside scaled to match, so the
content stays vertically centred with even space above and below. Widths stay as they are.

Status: building — 2026-09-26

Changes decisions in earlier plans:
- [translate-pill-and-keys](../2026-09-26-translate-pill-and-keys/index.md): the pill is 32 pt
  high (was 40); the language name is 11 pt and the language dots 5 pt.

## Goals

- A smaller, quieter pill, as the owner asked.
- The same states, widths, animations and behaviour as before.

## Non-goals

- New states or layouts; the right-click menu and the Ask answer panel keep their sizes.

## Key decisions

| Decision | Reason |
|---|---|
| 32 pt high for every state (`PILL_HEIGHT`) | The owner's size. |
| Labels 10.5 pt (working, done, preparing, error, Copy preview, Ask chip, Set up); nudge sentence 11 pt, "Don't show again" 10.5 pt, its key cap 10 pt | Scaled with the height; the nudge was one step larger before and stays so. |
| Waveform 13 pt tall (was 16); ✕ 10 pt (was 12); icons 12 pt (were 13–14) | About 0.8× like the height, so the space above and below stays even. |
| Language name 11 pt / 14 pt line (was 12 / 16); dots 5 pt (was 6) | Matches the smaller labels; the Translate width maths use the new dot size. |
| Copy button 22 pt (was 26) with 5 pt right padding; nudge ✕ 20 pt with 6 pt right padding | The same even inset from the pill's rounded end as before. |
| Widths unchanged | The labels shrink only slightly; changing widths would re-tune every state for little gain. |
| The onboarding Translate pill preview is 32 pt too | It is a copy of the real pill. |

## Parts

| File | Covers |
|---|---|
| (none) | Sizes live in `src/hooks/useCapsuleResize.ts`, the capsule components and `.pill*` in `src/styles/globals.css`. |

## Open questions

- None.
