#!/usr/bin/env node
// Plan `docs-structure`: validates the service cards in docs/guides/{speech,ai-polish}/services/
// and rewrites the generated tables in the guides and in the language preset catalogue.
//
//   node scripts/docs-cards.mjs          validate, then rewrite the generated tables
//   node scripts/docs-cards.mjs --check  validate, and fail if a generated table is out of date
//
// A generated table sits between two marker lines, for example
//   <!-- BEGIN GENERATED: speech-services -->  …  <!-- END GENERATED: speech-services -->
// Everything outside the markers is hand-written and left alone.
//
// Plain Node (18 or later), no packages. The vitest test `docsCards.test.ts` runs the check.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RUNS = ['on-device', 'local-network', 'cloud']
const COSTS = ['free', 'free-tier', 'paid']
const RUNS_LABEL = { 'on-device': 'On your computer', 'local-network': 'Your network', cloud: 'Cloud' }
const COST_LABEL = { free: 'Free', 'free-tier': 'Free tier', paid: 'Paid' }

/** The two card sets: where the cards live, which connections exist, and where the table goes. */
export const CARD_SETS = [
  {
    id: 'speech-services',
    dir: 'docs/guides/speech/services',
    table: 'docs/guides/speech/README.md',
    connections: {
      builtin: { label: 'Built-in', page: 'built-in.md' },
      'openai-compatible': { label: 'OpenAI-compatible', page: 'openai-compatible.md' },
      'qwen-cloud': { label: 'Qwen Cloud', page: 'qwen-cloud.md' },
    },
    // Endings the app adds itself; an address must stop before them.
    forbiddenEndings: ['/audio/transcriptions'],
  },
  {
    id: 'ai-polish-services',
    dir: 'docs/guides/ai-polish/services',
    table: 'docs/guides/ai-polish/README.md',
    connections: {
      builtin: { label: 'Built-in', page: 'built-in.md' },
      'openai-compatible': { label: 'OpenAI-compatible', page: 'openai-compatible.md' },
    },
    forbiddenEndings: ['/chat/completions'],
    thinkingOff: true,
  },
]

const REQUIRED_KEYS = ['id', 'name', 'connection', 'address', 'model', 'needs_key', 'runs', 'cost']
const OPTIONAL_KEYS = ['languages', 'notes']
const LIMITS = { name: 40, address: 100, model: 60, languages: 60, notes: 120, thinking_off: 100 }

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
 * Splits a card into front matter fields and body. The front matter is the same strict subset
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

/** Validates one card; returns the list of problems (empty when the card is fine). */
export function validateCard(set, fileId, fields, body) {
  const errors = []
  const allowed = [...REQUIRED_KEYS, ...OPTIONAL_KEYS, ...(set.thinkingOff ? ['thinking_off'] : [])]
  for (const key of Object.keys(fields)) {
    if (!allowed.includes(key)) errors.push(`unknown front matter key: ${key}`)
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in fields)) errors.push(`missing ${key}`)
  }
  for (const [key, max] of Object.entries(LIMITS)) {
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
  const connection = fields.connection
  if (connection !== undefined && !(connection in set.connections)) {
    errors.push(`connection must be one of ${Object.keys(set.connections).join(', ')}`)
  }
  const address = fields.address
  if (typeof address === 'string') {
    if (connection === 'builtin') {
      if (address !== 'none') errors.push('a built-in card has address: none')
    } else if (!/^https?:\/\/[^\s/]+/.test(address)) {
      errors.push('address must start with http:// or https://')
    } else {
      const trimmed = address.replace(/\/+$/, '')
      for (const ending of set.forbiddenEndings) {
        if (trimmed.endsWith(ending)) errors.push(`address must stop before ${ending}`)
      }
      if (address !== trimmed) errors.push('address must not end with /')
    }
  }
  for (const key of ['needs_key']) {
    if (key in fields && typeof fields[key] !== 'boolean') errors.push(`${key} must be true or false`)
  }
  if ('runs' in fields && !RUNS.includes(fields.runs)) errors.push(`runs must be one of ${RUNS.join(', ')}`)
  if ('cost' in fields && !COSTS.includes(fields.cost)) errors.push(`cost must be one of ${COSTS.join(', ')}`)
  if (connection === 'builtin' && fields.runs !== 'on-device') errors.push('a built-in card runs on-device')
  if (fields.runs === 'cloud' && fields.needs_key === false) errors.push('a cloud service needs a key')
  if (body === '') errors.push('the card needs a few lines of setup below the front matter')
  return errors
}

/** Reads and validates every card of a set. */
export function readCards(set, root = REPO_ROOT) {
  const dir = join(root, set.dir)
  const problems = []
  const cards = []
  if (!existsSync(dir)) return { cards, problems: [`${set.dir}: folder is missing`] }
  const files = readdirSync(dir).sort()
  for (const file of files) {
    const path = `${set.dir}/${file}`
    if (!file.endsWith('.md')) {
      problems.push(`${path}: only .md cards belong here`)
      continue
    }
    let parsed
    try {
      parsed = parseCard(readFileSync(join(dir, file), 'utf8'))
    } catch (error) {
      problems.push(`${path}: ${error.message}`)
      continue
    }
    const errors = validateCard(set, file.slice(0, -3), parsed.fields, parsed.body)
    for (const error of errors) problems.push(`${path}: ${error}`)
    if (errors.length === 0) cards.push({ file, ...parsed.fields })
  }
  if (cards.length === 0 && problems.length === 0) problems.push(`${set.dir}: no cards`)
  return { cards, problems }
}

const code = (text) => '`' + text + '`'

/** The Markdown table of a set, sorted by connection, then where it runs, then name. */
export function renderTable(set, cards) {
  const connectionOrder = Object.keys(set.connections)
  const sorted = [...cards].sort(
    (a, b) =>
      connectionOrder.indexOf(a.connection) - connectionOrder.indexOf(b.connection) ||
      RUNS.indexOf(a.runs) - RUNS.indexOf(b.runs) ||
      a.name.localeCompare(b.name, 'en'),
  )
  const servicesDir = relative(dirname(set.table), set.dir)
  const rows = [
    '| Service | Connection | Runs | Cost | API key | Address (example) | Model (example) | Notes |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const card of sorted) {
    const connection = set.connections[card.connection]
    const notes = [card.languages, card.notes].filter(Boolean).join('. ')
    rows.push(
      [
        `[${card.name}](${servicesDir}/${card.file})`,
        `[${connection.label}](${connection.page})`,
        RUNS_LABEL[card.runs],
        COST_LABEL[card.cost],
        card.needs_key ? 'Yes' : 'No',
        card.address === 'none' ? '—' : code(card.address),
        card.connection === 'builtin' ? card.model : code(card.model),
        notes,
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
 * Validates every card and computes each generated file. Returns the problems and, per file,
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
  for (const set of CARD_SETS) {
    const { cards, problems: cardProblems } = readCards(set, root)
    problems.push(...cardProblems)
    if (cardProblems.length === 0) update(set.table, set.id, renderTable(set, cards))
  }
  const catalogue = renderCatalogue(root)
  if (catalogue !== null) update(CATALOGUE.table, CATALOGUE.id, catalogue)
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
    console.log('Service cards are valid and the generated tables are up to date.')
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
