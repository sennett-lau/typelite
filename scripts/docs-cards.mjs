#!/usr/bin/env node
// Plan `docs-structure`: rewrites the generated language preset catalogue. Plan `model-guides`:
// validates the language guides in docs/guides/languages/ and writes their index in
// docs/guides/languages/README.md (the Languages page, which is not a guide). The speech and AI
// service tables are written by hand; this script checks their format (every step folder has the
// same pages and a Services table with the same columns) and every relative link in the docs.
//
//   node scripts/docs-cards.mjs          validate, then rewrite the generated tables
//   node scripts/docs-cards.mjs --check  validate, and fail if a generated table is out of date
//
// A generated table sits between two marker lines, for example
//   <!-- BEGIN GENERATED: language-guides -->  …  <!-- END GENERATED: language-guides -->
// Everything outside the markers is hand-written and left alone.
//
// Plain Node (18 or later), no packages. The vitest test `docsCards.test.ts` runs the check.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** Number of Unicode scalar values. */
const charCount = (text) => [...text].length

/**
 * Parses one value. Values must also be valid YAML, because GitHub renders the front matter as a
 * table: plain text may not start with a YAML indicator or hold ": " or " #", and quoted text
 * may not hold quotes or backslashes.
 */
function parseValue(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) throw new Error(`unclosed quote: ${raw}`)
    const inner = raw.slice(1, -1)
    if (/["\\]/.test(inner)) throw new Error(`quoted text may not hold " or \\: ${raw}`)
    return inner
  }
  if (/^[[\]{}&*!|>'%@`,?:#-]/.test(raw) || raw.includes(': ') || raw.includes(' #')) {
    throw new Error(`value is not plain YAML text; put it in "quotes": ${raw}`)
  }
  return raw
}

/**
 * Splits a language guide into front matter fields and body. The front matter is the same strict subset
 * as the language presets: one `key: value` per line, text (quotes optional), true or false.
 */
export function parseCard(text) {
  if (text.startsWith('﻿')) throw new Error('file starts with a byte-order mark')
  if (text.includes('\r')) throw new Error('file has CR line endings; use LF')
  if (!text.endsWith('\n')) throw new Error('file must end with a newline')
  const lines = text.split('\n')
  if (lines[0] !== '---') throw new Error('file must start with a --- front matter line')
  const end = lines.indexOf('---', 1)
  if (end < 0) throw new Error('front matter has no closing --- line')
  const fields = {}
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z_]+): (.+)$/.exec(line)
    if (!match) throw new Error(`front matter line is not "key: value": ${line}`)
    const [, key, raw] = match
    if (key in fields) throw new Error(`front matter key given twice: ${key}`)
    fields[key] = parseValue(raw.trim())
  }
  return { fields, body: lines.slice(end + 1).join('\n').trim() }
}

const code = (text) => '`' + text + '`'

// ─── Language guides (plan `model-guides`) ───

export const LANGUAGE_GUIDES = {
  id: 'language-guides',
  dir: 'docs/guides/languages',
  table: 'docs/guides/languages/README.md',
}

const GUIDE_REQUIRED_KEYS = ['id', 'language', 'codes', 'speech', 'polish', 'tier', 'authors']
const GUIDE_OPTIONAL_KEYS = ['preset', 'tested', 'notes']
const GUIDE_LIMITS = { language: 40, codes: 60, speech: 60, polish: 60, authors: 80, notes: 120 }
const GUIDE_TIERS = ['official', 'community']
export const GUIDE_SECTIONS = ['## Recommended setup', '## Why', '## Set it up']
const TAG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** Validates one language guide; returns the list of problems (empty when it is fine). */
export function validateLanguageGuide(fileId, fields, body, root = REPO_ROOT) {
  const errors = []
  for (const key of Object.keys(fields)) {
    if (![...GUIDE_REQUIRED_KEYS, ...GUIDE_OPTIONAL_KEYS].includes(key)) {
      errors.push(`unknown front matter key: ${key}`)
    }
  }
  for (const key of GUIDE_REQUIRED_KEYS) {
    if (!(key in fields)) errors.push(`missing ${key}`)
  }
  for (const [key, max] of Object.entries(GUIDE_LIMITS)) {
    const value = fields[key]
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim() === '') errors.push(`${key} must be text`)
    else if (charCount(value) > max) errors.push(`${key} is longer than ${max} characters`)
    else if (value.includes('|')) errors.push(`${key} must not contain "|"`)
  }
  if (typeof fields.id === 'string') {
    if (!ID_PATTERN.test(fields.id)) errors.push('id must be a lowercase slug')
    else if (fields.id !== fileId) errors.push(`id "${fields.id}" differs from its file "${fileId}.md"`)
  }
  if (typeof fields.codes === 'string') {
    for (const tag of fields.codes.split(',').map((part) => part.trim())) {
      if (!TAG_PATTERN.test(tag)) errors.push(`codes: "${tag}" is not a language tag such as zh-Hant-HK`)
    }
  }
  if ('tier' in fields && !GUIDE_TIERS.includes(fields.tier)) {
    errors.push(`tier must be one of ${GUIDE_TIERS.join(', ')}`)
  }
  if ('preset' in fields) {
    const preset = fields.preset
    if (typeof preset !== 'string' || !existsSync(join(root, 'presets/languages', preset, 'preset.md'))) {
      errors.push(`preset "${preset}" is not a folder in presets/languages/`)
    }
  }
  if ('tested' in fields && !/^\d{4}-\d{2}-\d{2}$/.test(String(fields.tested))) {
    errors.push('tested must be a date such as 2026-09-27')
  }
  for (const heading of GUIDE_SECTIONS) {
    if (!body.split('\n').includes(heading)) errors.push(`missing section "${heading}"`)
  }
  return errors
}

/** Reads and validates every language guide (README.md in the folder is the Languages page). */
export function readLanguageGuides(root = REPO_ROOT) {
  const dir = join(root, LANGUAGE_GUIDES.dir)
  const problems = []
  const guides = []
  if (!existsSync(dir)) return { guides, problems: [`${LANGUAGE_GUIDES.dir}: folder is missing`] }
  for (const file of readdirSync(dir).sort()) {
    if (file === 'README.md') continue
    const path = `${LANGUAGE_GUIDES.dir}/${file}`
    if (!file.endsWith('.md')) {
      problems.push(`${path}: only .md guides belong here`)
      continue
    }
    let parsed
    try {
      parsed = parseCard(readFileSync(join(dir, file), 'utf8'))
    } catch (error) {
      problems.push(`${path}: ${error.message}`)
      continue
    }
    const errors = validateLanguageGuide(file.slice(0, -3), parsed.fields, parsed.body, root)
    for (const error of errors) problems.push(`${path}: ${error}`)
    if (errors.length === 0) guides.push({ file, ...parsed.fields })
  }
  return { guides, problems }
}

/** The index of language guides: official first, then by language name. */
export function renderLanguageGuides(guides) {
  const sorted = [...guides].sort(
    (a, b) =>
      GUIDE_TIERS.indexOf(a.tier) - GUIDE_TIERS.indexOf(b.tier) ||
      a.language.localeCompare(b.language, 'en'),
  )
  // The index may sit in the guides' own folder: then a guide is linked by its file name alone.
  const guidesDir = relative(dirname(LANGUAGE_GUIDES.table), LANGUAGE_GUIDES.dir)
  const guidePath = (file) => (guidesDir ? `${guidesDir}/${file}` : file)
  const rows = [
    '| Language | Codes | Speech recognition | AI polish | Language preset | Tier | Tested |',
    '|---|---|---|---|---|---|---|',
  ]
  if (sorted.length === 0) rows.push('| No language guides yet | | | | | | |')
  for (const guide of sorted) {
    const preset = guide.preset ? `[${guide.preset}](../../../presets/languages/${guide.preset}/preset.md)` : '—'
    rows.push(
      [
        `[${guide.language}](${guidePath(guide.file)})`,
        guide.codes.split(',').map((tag) => code(tag.trim())).join(', '),
        guide.speech,
        guide.polish,
        preset,
        guide.tier === 'official' ? 'Official' : 'Community',
        guide.tested ? String(guide.tested) : '—',
      ]
        .join(' | ')
        .replace(/^/, '| ')
        .concat(' |'),
    )
  }
  return rows.join('\n')
}

// ─── Language preset catalogue ───

export const CATALOGUE = {
  id: 'preset-catalogue',
  index: 'presets/languages/index.json',
  codes: 'presets/languages/language-codes.json',
  table: 'presets/languages/README.md',
}

/** English name of a language tag's first part, from language-codes.json. */
function languageName(tag, names) {
  const primary = tag.split('-')[0]
  return names[primary] ?? primary
}

/**
 * The catalogue of every preset in index.json, grouped by language (a preset that serves two
 * languages is listed under both). Returns null when the preset folder does not exist.
 */
export function renderCatalogue(root = REPO_ROOT) {
  const indexPath = join(root, CATALOGUE.index)
  if (!existsSync(indexPath)) return null
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const codes = JSON.parse(readFileSync(join(root, CATALOGUE.codes), 'utf8'))
  const names = codes.languages ?? {}
  const groups = new Map()
  for (const preset of index.presets) {
    const languages = [...new Set(preset.languages.map((tag) => languageName(tag, names)))]
    for (const language of languages) {
      if (!groups.has(language)) groups.set(language, [])
      groups.get(language).push(preset)
    }
  }
  const out = []
  for (const language of [...groups.keys()].sort((a, b) => a.localeCompare(b, 'en'))) {
    out.push(`### ${language}`, '')
    out.push('| Preset | Codes | Used for | Tier | Version | Authors |')
    out.push('|---|---|---|---|---|---|')
    const presets = groups.get(language).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    for (const preset of presets) {
      const tier = preset.tier === 'official' ? 'Official' : 'Community'
      const usedFor = preset.applies_to
        .map((operation) => (operation === 'polish' ? 'Polish' : 'Translate'))
        .join(', ')
      const name = preset.deprecated ? `${preset.name} (deprecated)` : preset.name
      out.push(
        `| [${name}](${preset.path}) | ${preset.languages.map(code).join(', ')} | ${usedFor} | ${tier} | ${preset.version} | ${preset.authors.join(', ')} |`,
      )
    }
    out.push('')
  }
  return out.join('\n').trim()
}

// ─── Guide steps: speech, AI polish, and any later one (CONTRIBUTING.md#guide-steps) ───

export const STEPS = [
  { id: 'speech', dir: 'docs/guides/speech', models: 'docs/guides/models/speech-recognition.md' },
  { id: 'ai-polish', dir: 'docs/guides/ai-polish', models: 'docs/guides/models/ai-polish.md' },
]
export const STEP_PAGES = ['README.md', 'troubleshooting.md']
export const STEP_README_SECTIONS = ['## Connections', '## Services', '## More']
export const SERVICES_HEADER =
  '| Service | Runs | Cost | API key | Address (example) | Model (example) | Notes |'
const SERVICE_RUNS = ['On your computer', 'Your computer or network', 'Your network', 'Cloud']
const SERVICE_COSTS = ['Free', 'Free tier', 'Paid']
// Paths the app adds to an address itself.
const ADDRESS_ENDINGS = ['/audio/transcriptions', '/chat/completions']

/** Splits a Markdown table row into trimmed cells. */
const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

/** Checks one Services table row; returns its problems. */
export function validateServiceRow(row) {
  const errors = []
  const parts = cells(row)
  if (parts.length !== 7) return [`row needs 7 cells, has ${parts.length}: ${row}`]
  const [service, runs, cost, key, address] = parts
  const name = service.replace(/^\[([^\]]+)\].*$/, '$1')
  if (!/^\[[^\]]+\]\([^)]+\)$/.test(service)) errors.push(`${name}: Service must be a link to its setup`)
  if (!SERVICE_RUNS.includes(runs)) errors.push(`${name}: Runs must be one of ${SERVICE_RUNS.join(', ')}`)
  if (!SERVICE_COSTS.includes(cost)) errors.push(`${name}: Cost must be one of ${SERVICE_COSTS.join(', ')}`)
  if (!['Yes', 'No'].includes(key)) errors.push(`${name}: API key must be Yes or No`)
  if (runs === 'Cloud' && key !== 'Yes') errors.push(`${name}: a cloud service needs a key`)
  if (address !== '—') {
    const url = address.replace(/^`|`$/g, '')
    if (!/^`https?:\/\/[^\s`]+`$/.test(address)) errors.push(`${name}: Address must be \`http(s)://…\` or —`)
    else if (url.endsWith('/')) errors.push(`${name}: Address must not end with /`)
    else if (ADDRESS_ENDINGS.some((ending) => url.endsWith(ending))) {
      errors.push(`${name}: Address must stop before the path Typelite adds`)
    }
  }
  return errors
}

/** Checks one step folder: its pages, its README sections and its Services table. */
export function validateStep(step, root = REPO_ROOT) {
  const problems = []
  for (const page of STEP_PAGES) {
    if (!existsSync(join(root, step.dir, page))) problems.push(`${step.dir}/${page}: file is missing`)
  }
  if (!existsSync(join(root, step.models))) problems.push(`${step.models}: file is missing`)
  for (const entry of existsSync(join(root, step.dir)) ? readdirSync(join(root, step.dir)) : []) {
    if (!entry.endsWith('.md')) problems.push(`${step.dir}/${entry}: a step folder holds only .md pages`)
  }
  const readmePath = join(root, step.dir, 'README.md')
  if (!existsSync(readmePath)) return problems
  const lines = readFileSync(readmePath, 'utf8').split('\n')
  const where = `${step.dir}/README.md`
  for (const heading of STEP_README_SECTIONS) {
    if (!lines.includes(heading)) problems.push(`${where}: missing section "${heading}"`)
  }
  const start = lines.indexOf(SERVICES_HEADER)
  if (start < 0) {
    problems.push(`${where}: the Services table must start with ${SERVICES_HEADER}`)
    return problems
  }
  let rows = 0
  for (const row of lines.slice(start + 2)) {
    if (!row.startsWith('|')) break
    rows++
    for (const error of validateServiceRow(row)) problems.push(`${where}: ${error}`)
  }
  if (rows === 0) problems.push(`${where}: the Services table has no rows`)
  return problems
}

// ─── Links ───

/** Markdown files whose relative links are checked. */
export const LINKED_DOCS = ['README.md', 'CONTRIBUTING.md', 'docs/guides', 'docs/dev', 'presets/languages', '.claude/skills']

/** GitHub's anchor for a heading. */
export function headingAnchor(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')
}

function markdownFiles(root, path) {
  const full = join(root, path)
  if (!existsSync(full)) return []
  if (path.endsWith('.md')) return [path]
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? markdownFiles(root, `${path}/${entry.name}`)
      : entry.name.endsWith('.md')
        ? [`${path}/${entry.name}`]
        : [],
  )
}

function anchorsOf(text) {
  const seen = new Map()
  const anchors = new Set()
  for (const line of text.replace(/```[\s\S]*?```/g, '').split('\n')) {
    const match = /^#{1,6} (.+)$/.exec(line)
    if (!match) continue
    const base = headingAnchor(match[1])
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
  return anchors
}

/** Every relative link (and its #anchor) in the checked docs must point at something that exists. */
export function checkLinks(root = REPO_ROOT) {
  const problems = []
  const cache = new Map()
  const anchors = (path) => {
    if (!cache.has(path)) cache.set(path, anchorsOf(readFileSync(path, 'utf8')))
    return cache.get(path)
  }
  for (const file of LINKED_DOCS.flatMap((path) => markdownFiles(root, path))) {
    const text = readFileSync(join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1]
      if (/^[a-z]+:/.test(link)) continue
      const [target, anchor] = link.split('#')
      const full = target ? join(root, dirname(file), decodeURI(target)) : join(root, file)
      if (!existsSync(full)) problems.push(`${file}: broken link ${link}`)
      else if (anchor && full.endsWith('.md') && !anchors(full).has(anchor)) {
        problems.push(`${file}: no heading for #${anchor} in ${link}`)
      }
    }
  }
  return problems
}

// ─── Markers ───

/** Replaces the text between the markers of `id` in `text`; throws when they are missing. */
export function replaceBetweenMarkers(text, id, content) {
  const begin = `<!-- BEGIN GENERATED: ${id} -->`
  const end = `<!-- END GENERATED: ${id} -->`
  const start = text.indexOf(begin)
  const stop = text.indexOf(end)
  if (start < 0 || stop < start) throw new Error(`missing ${begin} / ${end} markers`)
  const note = '<!-- Generated by scripts/docs-cards.mjs; edit the source files, not this table. -->'
  return `${text.slice(0, start + begin.length)}\n${note}\n\n${content}\n\n${text.slice(stop)}`
}

/**
 * Validates every language guide and computes each generated file. Returns the problems and, per file,
 * its current and expected text.
 */
export function buildDocs(root = REPO_ROOT) {
  const problems = []
  const files = []
  const update = (path, id, content) => {
    const full = join(root, path)
    if (!existsSync(full)) {
      problems.push(`${path}: file is missing`)
      return
    }
    const current = readFileSync(full, 'utf8')
    try {
      files.push({ path, current, expected: replaceBetweenMarkers(current, id, content) })
    } catch (error) {
      problems.push(`${path}: ${error.message}`)
    }
  }
  const catalogue = renderCatalogue(root)
  if (catalogue !== null) update(CATALOGUE.table, CATALOGUE.id, catalogue)
  if (existsSync(join(root, LANGUAGE_GUIDES.dir))) {
    const { guides, problems: guideProblems } = readLanguageGuides(root)
    problems.push(...guideProblems)
    if (guideProblems.length === 0) {
      update(LANGUAGE_GUIDES.table, LANGUAGE_GUIDES.id, renderLanguageGuides(guides))
    }
  }
  for (const step of STEPS) problems.push(...validateStep(step, root))
  problems.push(...checkLinks(root))
  return { problems, files }
}

/** The problems plus every generated file that is out of date. Empty means all is well. */
export function checkDocs(root = REPO_ROOT) {
  const { problems, files } = buildDocs(root)
  const stale = files
    .filter((file) => file.current !== file.expected)
    .map((file) => `${file.path}: generated table is out of date; run npm run docs:cards`)
  return [...problems, ...stale]
}

function main() {
  const check = process.argv.includes('--check')
  if (check) {
    const problems = checkDocs()
    for (const problem of problems) console.error(`error: ${problem}`)
    if (problems.length > 0) process.exit(1)
    console.log('Docs are valid: step folders, Services tables, language guides, links and generated tables.')
    return
  }
  const { problems, files } = buildDocs()
  if (problems.length > 0) {
    for (const problem of problems) console.error(`error: ${problem}`)
    process.exit(1)
  }
  for (const file of files) {
    if (file.current !== file.expected) {
      writeFileSync(join(REPO_ROOT, file.path), file.expected)
      console.log(`Wrote ${file.path}`)
    }
  }
  console.log('Generated tables are up to date.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
