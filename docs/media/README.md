# Media

The images and GIFs used by the project README. None of them is captured by hand: one script
renders them all, so they can be regenerated whenever the UI changes.

```sh
npm ci                              # at the repository root: the app's own build tools
cd site && npm ci
npm run capture                     # node scripts/capture-media.mjs [--only hero,translate,ask,og,app]
```

It needs Chromium (`/Applications/Chromium.app`, or set `CHROMIUM`) and ffmpeg (or set `FFMPEG`).

| Files | What they show | How they are made |
|---|---|---|
| `hero.gif`, `translate.gif`, `ask.gif` | The pill dictating, translating and answering | The website's demo components (`site/src/demos`), rendered frame by frame from `site/capture/` in headless Chromium, then encoded by ffmpeg with a generated palette |
| `home.png`, `settings-languages.png`, `onboarding.png`, `copy-pill.png` | The app's windows and the Copy pill | The real app components from `src/`, with a mocked Tauri backend (`site/capture-app/`, `site/scripts/capture-app-screens.mjs`) |
| `*-dark.png` | The same, in dark mode | As above; the README picks one with `prefers-color-scheme` |

The website's link preview (`site/public/og.png`) comes from the same script.

Conventions:

- Stills are PNG, 1600 px wide; the light version has no suffix, the dark one ends in `-dark`.
  Moving shots are GIF, at most 8 MB each.
- Use neutral example text, generic preset names and documentation addresses such as
  `192.0.2.10`: never real names, host names, addresses or keys.
