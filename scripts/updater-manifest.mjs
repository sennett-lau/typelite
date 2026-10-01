#!/usr/bin/env node
// Writes latest.json for Tauri's updater (plan `auto-update`, docs/releasing.md).
//
// The app reads https://github.com/<repo>/releases/latest/download/latest.json, so every
// release uploads this file with its signed update package. The notes are the version's What's
// New lines (src/lib/whatsNew.ts, English strings), as on the release page.
//
// Usage:
//   node scripts/updater-manifest.mjs <version> <path to .app.tar.gz.sig> <download URL of .app.tar.gz>
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const [versionArg, signaturePath, url] = process.argv.slice(2)
const version = (versionArg || '').replace(/^v/, '')
if (!version || !signaturePath || !url) {
  console.error('Usage: node scripts/updater-manifest.mjs <version> <signature file> <package URL>')
  process.exit(1)
}

const source = readFileSync(join(root, 'src/lib/whatsNew.ts'), 'utf8')
const entry = source.match(
  new RegExp(`version:\\s*'${version.replace(/\./g, '\\.')}'\\s*,\\s*changeKeys:\\s*\\[([^\\]]*)\\]`),
)
const strings = JSON.parse(readFileSync(join(root, 'src/i18n/locales/en.json'), 'utf8')).whatsNew
const changes = entry ? [...entry[1].matchAll(/'([^']+)'/g)].map((m) => strings[m[1]] ?? m[1]) : []

const manifest = {
  version,
  notes: changes.map((change) => `- ${change}`).join('\n'),
  pub_date: new Date().toISOString(),
  platforms: {
    // Apple Silicon only, like the DMG (docs/releasing.md).
    'darwin-aarch64': {
      signature: readFileSync(signaturePath, 'utf8').trim(),
      url,
    },
  },
}
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`)
