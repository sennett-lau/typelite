#!/usr/bin/env node
// Prints the GitHub release notes for one version (see docs/releasing.md).
//
// The changes come from What's New (src/lib/whatsNew.ts, English strings in
// src/i18n/locales/en.json), so the release page and the Home tab say the same thing.
//
// Usage:
//   node scripts/release-notes.mjs 0.1.0 > notes.md
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = (process.argv[2] || '').replace(/^v/, '')
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs <version>')
  process.exit(1)
}

// whatsNew.ts is plain data: find this version's entry and its quoted change keys.
const source = readFileSync(join(root, 'src/lib/whatsNew.ts'), 'utf8')
const entry = source.match(
  new RegExp(`version:\\s*'${version.replace(/\./g, '\\.')}'\\s*,\\s*changeKeys:\\s*\\[([^\\]]*)\\]`),
)
const strings = JSON.parse(readFileSync(join(root, 'src/i18n/locales/en.json'), 'utf8')).whatsNew
const changes = entry ? [...entry[1].matchAll(/'([^']+)'/g)].map((m) => strings[m[1]] ?? m[1]) : []

const lines = [
  `## What's New in ${version}`,
  '',
  ...(changes.length
    ? changes.map((c) => `- ${c}`)
    : [`No What's New entry for ${version} yet (src/lib/whatsNew.ts).`]),
  '',
  '## Install',
  '',
  '1. Download the `.dmg` (or the `.zip`) below. It is for Macs with Apple Silicon.',
  '2. Open the DMG and drag Typelite to Applications.',
  '3. This build is not signed or notarised by Apple yet, so macOS blocks it the first time.',
  '   Right-click Typelite.app and choose **Open** (on macOS 15 and later: System Settings →',
  '   Privacy & Security → **Open Anyway**), or run this once in Terminal:',
  '',
  '   ```sh',
  '   xattr -dr com.apple.quarantine /Applications/Typelite.app',
  '   ```',
  '',
  '4. Allow Microphone and Accessibility when asked, then follow the guided setup.',
  '',
  '`SHA256SUMS.txt` lists the SHA-256 of each file. Check a download with',
  '`shasum -a 256 -c SHA256SUMS.txt` in the folder you downloaded to.',
]
console.log(lines.join('\n'))
