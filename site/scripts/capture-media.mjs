// Regenerates the README media in docs/media/ and the site's Open Graph image.
//
//   cd site && npm ci && node scripts/capture-media.mjs [--only hero,translate,ask,og,app]
//
// - hero.gif, translate.gif, ask.gif: the site's own demo components (src/demos), rendered
//   frame by frame on capture/index.html in headless Chromium, then encoded by ffmpeg with a
//   generated palette.
// - home.png, settings-languages.png, onboarding.png, copy-pill.png (+ -dark): the real app's
//   components with a mocked backend (scripts/capture-app-screens.mjs; needs `npm ci` at the
//   repository root too).
// - public/og.png: the 1200 × 630 link preview card.
//
// Needs Chromium (CHROMIUM=/path/to/chrome to override) and ffmpeg (FFMPEG=...).

import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { launch } from './lib/chromium.mjs'
import { captureAppScreens } from './capture-app-screens.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(siteRoot, '..')
const mediaDir = join(repoRoot, 'docs/media')
const FFMPEG = process.env.FFMPEG || 'ffmpeg'

/** Animated demos: scene, theme, time range (s), frame rate, CSS size and scale. */
const GIFS = [
  {
    name: 'hero',
    scene: 'hero',
    theme: 'dark',
    from: 0,
    to: 16,
    fps: 12,
    width: 1000,
    height: 820,
    scale: 1,
    colors: 192,
  },
  {
    name: 'translate',
    scene: 'translate',
    theme: 'dark',
    from: 9,
    to: 18,
    fps: 12,
    width: 600,
    height: 340,
    scale: 1.5,
    colors: 160,
  },
  {
    name: 'ask',
    scene: 'ask',
    theme: 'dark',
    from: 0,
    to: 11,
    fps: 12,
    width: 600,
    height: 420,
    scale: 1.5,
    colors: 160,
  },
]

const only = (() => {
  const i = process.argv.indexOf('--only')
  return i > 0 ? new Set(process.argv[i + 1].split(',')) : null
})()
const wanted = (name) => !only || only.has(name)

async function main() {
  const server = await createServer({
    root: siteRoot,
    configFile: join(siteRoot, 'vite.config.ts'),
    logLevel: 'warn',
    server: { port: 0 },
  })
  await server.listen()
  const base = server.resolvedUrls.local[0].replace(/\/$/, '')
  const browser = await launch()
  try {
    for (const gif of GIFS) if (wanted(gif.name)) await captureGif(browser, base, gif)
    if (wanted('og')) await captureOg(browser, base)
    if (wanted('app')) {
      const files = await captureAppScreens({ browser, outDir: mediaDir })
      for (const f of files) await report(f)
    }
  } finally {
    await browser.close()
    await server.close()
  }
}

async function captureGif(
  browser,
  base,
  { name, scene, theme, from, to, fps, width, height, scale, colors },
) {
  const page = await browser.newPage({ width, height, scale, dark: theme === 'dark' })
  await page.goto(`${base}/capture/?scene=${scene}&theme=${theme}`)
  await page.waitFor('window.__typeliteCapture && document.querySelector("#frame > *")')
  await document_fonts(page)
  const frames = await mkdtemp(join(tmpdir(), `typelite-${name}-`))
  const step = 1 / fps
  let i = 0
  for (let t = from; t < to - 1e-6; t += step) {
    await page.evaluate(`window.__typeliteCapture.setTime(${t.toFixed(4)})`)
    // Let CSS transitions (pill width, fades) run for about one frame of real time.
    await new Promise((r) => setTimeout(r, Math.round(1000 / fps)))
    await page.screenshot(join(frames, `f${String(i++).padStart(4, '0')}.png`), {
      selector: '#frame',
    })
  }
  page.close()
  const out = join(mediaDir, `${name}.gif`)
  execFileSync(FFMPEG, [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(fps),
    '-i',
    join(frames, 'f%04d.png'),
    '-filter_complex',
    `[0:v]split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
    '-loop',
    '0',
    out,
  ])
  await rm(frames, { recursive: true, force: true })
  await report(out, `${i} frames`)
}

async function captureOg(browser, base) {
  const page = await browser.newPage({ width: 1200, height: 630, scale: 1, dark: true })
  await page.goto(`${base}/capture/?scene=og&theme=dark`)
  await page.waitFor('document.querySelector(".og")')
  await document_fonts(page)
  await new Promise((r) => setTimeout(r, 300))
  const out = join(siteRoot, 'public/og.png')
  await page.screenshot(out, { selector: '.og' })
  page.close()
  await report(out)
}

async function document_fonts(page) {
  await page.evaluate('document.fonts.ready.then(() => true)')
}

async function report(file, extra = '') {
  const { size } = await stat(file)
  console.log(`${file.replace(repoRoot + '/', '')}  ${(size / 1024).toFixed(0)} KB ${extra}`)
}

await main()
