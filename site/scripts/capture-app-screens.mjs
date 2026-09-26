// Screenshots of the real app UI for the README (docs/media/*.png).
//
// The app's own React components (../src) render in headless Chromium with a mocked Tauri
// backend (site/capture-app). The page is served by a Vite dev server built from the ROOT
// project's Vite, React plugin and Tailwind plugin, so run `npm ci` at the repository root first.
//
//   node site/scripts/capture-app-screens.mjs            # writes docs/media/
//   node site/scripts/capture-app-screens.mjs --out dir  # or somewhere else
//
// Or call captureAppScreens({ browser, outDir }) from capture-media.mjs.

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch } from './lib/chromium.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const harnessRoot = join(repoRoot, 'site/capture-app')

/** Each stage's CSS width times its scale is 1600 px. */
export const APP_SCREENS = [
  { name: 'home', screen: 'home', width: 1000, height: 820, scale: 1.6 },
  {
    name: 'settings-languages',
    screen: 'settings-languages',
    width: 1000,
    height: 820,
    scale: 1.6,
  },
  { name: 'onboarding', screen: 'onboarding', width: 1000, height: 820, scale: 1.6 },
  { name: 'copy-pill', screen: 'copy-pill', width: 500, height: 150, scale: 3.2 },
]

/** Imports a package's ESM entry from the repository root's node_modules. */
async function importFromRoot(name) {
  const require = createRequire(join(repoRoot, 'package.json'))
  const dir = require.resolve
    .paths(name)
    .map((base) => join(base, name))
    .find((d) => existsSync(join(d, 'package.json')))
  if (!dir) throw new Error(`${name} is not installed at the repository root; run npm ci there`)
  const pkgPath = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  let entry = pkg.exports?.['.'] ?? pkg.module ?? pkg.main
  while (entry && typeof entry === 'object') entry = entry.import ?? entry.default
  if (typeof entry !== 'string') throw new Error(`No ESM entry for ${name}`)
  return import(pathToFileURL(join(dirname(pkgPath), entry)).href)
}

async function startServer() {
  if (!existsSync(join(repoRoot, 'node_modules/vite'))) {
    throw new Error('Run `npm ci` at the repository root first (the capture uses the app build).')
  }
  const { createServer } = await importFromRoot('vite')
  const react = (await importFromRoot('@vitejs/plugin-react')).default
  const tailwindcss = (await importFromRoot('@tailwindcss/vite')).default
  const rootModules = join(repoRoot, 'node_modules')
  const server = await createServer({
    configFile: false,
    root: harnessRoot,
    logLevel: 'warn',
    clearScreen: false,
    plugins: [react(), tailwindcss()],
    resolve: {
      // One copy of React and the Tauri API: the app's, from the repository root.
      alias: [
        { find: /^react$/, replacement: join(rootModules, 'react') },
        { find: /^react\/(.*)$/, replacement: join(rootModules, 'react/$1') },
        { find: /^react-dom$/, replacement: join(rootModules, 'react-dom') },
        { find: /^react-dom\/(.*)$/, replacement: join(rootModules, 'react-dom/$1') },
        { find: /^@tauri-apps\/api\/(.*)$/, replacement: join(rootModules, '@tauri-apps/api/$1') },
      ],
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 0,
      strictPort: false,
      fs: { allow: [repoRoot, realpathSync(rootModules)] },
      watch: { ignored: ['**/src-tauri/**', '**/node_modules/**'] },
    },
  })
  await server.listen()
  const url = server.resolvedUrls?.local?.[0]
  if (!url) throw new Error('Vite did not report a URL')
  return { server, url }
}

function optimise(path) {
  for (const [tool, args] of [
    ['oxipng', ['-o', '3', '--strip', 'safe', '-q', path]],
    ['pngquant', ['--force', '--skip-if-larger', '--quality=80-95', '--output', path, path]],
  ]) {
    try {
      execFileSync(tool, args, { stdio: 'ignore' })
      return tool
    } catch {
      // Not installed (or no gain): keep the PNG as Chromium wrote it.
    }
  }
  return null
}

export async function captureAppScreens({ browser, outDir, themes = ['light', 'dark'] }) {
  await mkdir(outDir, { recursive: true })
  const { server, url } = await startServer()
  const written = []
  try {
    for (const { name, screen, width, height, scale } of APP_SCREENS) {
      for (const theme of themes) {
        const dark = theme === 'dark'
        const page = await browser.newPage({ width, height, scale, dark })
        await page.goto(`${url}?screen=${screen}&theme=${theme}`)
        await page.waitFor('window.__captureReady === true', 60000)
        if (screen === 'home') {
          // Open "Compare presets" in Insights.
          await page.evaluate(`document.querySelector('button[aria-expanded="false"]')?.click()`)
          await new Promise((r) => setTimeout(r, 700))
        }
        if (screen === 'settings-languages') {
          // Scroll the settings page so the Translation group starts near the top.
          await page.evaluate(`(() => {
            const rows = document.querySelector('.language-rows')
            let scroller = rows?.parentElement
            while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
            if (!rows || !scroller) return
            const top = rows.getBoundingClientRect().top - scroller.getBoundingClientRect().top
            scroller.scrollTop += top - 64
          })()`)
          await new Promise((r) => setTimeout(r, 400))
        }
        const file = join(outDir, `${name}${dark ? '-dark' : ''}.png`)
        await page.screenshot(file, { selector: '#stage' })
        optimise(file)
        written.push(file)
        const logs = await page.evaluate('window.__captureLogs ?? []')
        if (logs.length) console.warn(`[${name} ${theme}]\n  ${logs.join('\n  ')}`)
        page.close()
      }
    }
  } finally {
    await server.close()
  }
  return written
}

// Run directly: node site/scripts/capture-app-screens.mjs [--out dir]
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outFlag = process.argv.indexOf('--out')
  const outDir = outFlag > 0 ? resolve(process.argv[outFlag + 1]) : join(repoRoot, 'docs/media')
  const browser = await launch()
  try {
    const files = await captureAppScreens({ browser, outDir })
    for (const file of files) console.log(file)
  } finally {
    await browser.close()
  }
}
