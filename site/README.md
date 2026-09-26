# Typelite site

The one-page website for Typelite: Vite, React and TypeScript, deployed to GitHub Pages at
`https://sennett-lau.github.io/typelite/`. It is a separate project with its own
`package.json` and lockfile; nothing here is part of the app.

## Develop

```sh
cd site
npm ci
npm run dev        # http://localhost:5173/typelite/
```

The animated demos (`src/demos/`) are React components drawn as a function of time, using the
app's own design tokens, pill sizes and timings (`src/styles.css`, `src/components/Pill.tsx`).
They play only while on screen, have a pause button, and show a still frame with reduced motion.
The language cards read `../presets/languages/index.json`, so they follow the preset library.

"How it works" (`src/sections/Story.tsx`) is driven by scrolling: the section is tall, its
content sticks to the screen, and scroll progress picks the step and scrubs it. The rest of the
motion is plain CSS or small `requestAnimationFrame` loops that animate only transform, opacity
and filter: the hero's drifting aurora and headline entrance (CSS, so the pre-rendered page
animates too), the pointer glow and magnetic primary buttons (desktop pointers only), the top
bar's reading progress, and scroll reveals. No animation library. With
`prefers-reduced-motion: reduce` everything is still and readable: no drifting, no reveals, the
story is a plain list and each demo shows one frame.

## Build

```sh
npm run build      # type-check, build, then pre-render the page into dist/index.html
npm run preview    # serve dist/ at http://localhost:4173/typelite/
```

The build pre-renders the whole page to static HTML (`scripts/prerender.mjs`), so it reads
fine without JavaScript and in link previews; the browser then hydrates it. `dist/` is not
committed.

## Deploy

`.github/workflows/pages.yml` builds `site/` and deploys it on every push to `main` that
changes `site/**` (or the preset index), and on demand from the Actions tab
(**Run workflow**). Before the first deploy:

1. GitHub Pages needs the repository to be **public** (or a paid plan for private Pages).
2. Enable it in **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The site is served under `/typelite/`, which is why `vite.config.ts` sets `base: '/typelite/'`.
For a custom domain or another repository name, change `base` and the absolute URLs in
`index.html` (canonical and Open Graph image).

## Media

`npm run capture` (`scripts/capture-media.mjs`) regenerates:

- `../docs/media/hero.gif`, `translate.gif`, `ask.gif`: the site's demos, rendered frame by
  frame in headless Chromium from `capture/index.html` and encoded with ffmpeg.
- `../docs/media/home.png`, `settings-languages.png`, `onboarding.png`, `copy-pill.png` and
  their `-dark` versions: the **real app components** from `../src`, rendered with a mocked
  Tauri backend (`capture-app/`, `scripts/capture-app-screens.mjs`). This part uses the app's
  own Vite and Tailwind, so run `npm ci` at the repository root first.
- `public/og.png`: the 1200 × 630 link preview.

It needs Chromium (`/Applications/Chromium.app` by default, or set `CHROMIUM`) and ffmpeg
(or set `FFMPEG`). `--only hero,translate,ask,og,app` limits what is captured. Neither
`capture/` nor `capture-app/` is part of the published site.

## Privacy

No analytics, cookies or third-party scripts. The only outside request is an anonymous call to
GitHub's public API for the star and fork counts; if it fails, the buttons show no number.
