// Pre-renders the page into dist/index.html after `vite build`, so the whole page is readable
// without JavaScript (and by search engines and link previews). The browser then hydrates it.
//
// Run by `npm run build`: vite build → vite build --ssr → node scripts/prerender.mjs

import { readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ssrDir = join(root, 'dist-ssr')
const indexPath = join(root, 'dist', 'index.html')

const { render } = await import(pathToFileURL(join(ssrDir, 'entry-server.js')).href)
const template = await readFile(indexPath, 'utf8')
if (!template.includes('<!--app-->')) throw new Error('dist/index.html has no <!--app--> marker')

const html = template.replace('<!--app-->', render())
await writeFile(indexPath, html)
await rm(ssrDir, { recursive: true, force: true })
console.log(`prerendered dist/index.html (${Math.round(html.length / 1024)} KB)`)
