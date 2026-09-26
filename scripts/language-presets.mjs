#!/usr/bin/env node
// Plan `language-prompt-library`: validates every language preset in presets/languages/ and
// writes presets/languages/index.json, the one file the app fetches to list presets.
//
//   node scripts/language-presets.mjs          validate, then rewrite index.json
//   node scripts/language-presets.mjs --check  validate, and fail if index.json is out of date
//
// Plain Node (18 or later), no packages. The Rust test `llm::language_library` checks the same
// rules with its own parser, so the two must agree.

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets', 'languages')
const INDEX_PATH = join(ROOT, 'index.json')

const INDEX_FORMAT = 1
const PRESET_FORMAT = 1
const MAX_FILE_BYTES = 8 * 1024
const MAX_RENDERED_CHARS = 2000
const MAX_VARIANT_CHARS = 400
const MAX_NAME_CHARS = 60
const MAX_SUMMARY_CHARS = 140
const MAX_HINT_CHARS = 140
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TAG_PATTERN = /^([a-z]{2,3})(-[A-Z][a-z]{3})?(-(?:[A-Z]{2}|[0-9]{3}))?$/
const TIERS = ['official', 'community']
const OPERATIONS = ['polish', 'translate']
const LICENSE = 'CC0-1.0'
/** A preset folder holds the preset and, optionally, notes for reviewers. Nothing else. */
const ALLOWED_FILES = ['preset.md', 'NOTES.md']
const REQUIRED_KEYS = [
  'id',
  'name',
  'version',
  'format',
  'tier',
  'languages',
  'applies_to',
  'summary',
  'authors',
  'license',
]
const OPTIONAL_KEYS = ['model_hint', 'deprecated']

/** Number of Unicode scalar values, the way the app (Rust `chars()`) counts. */
const charCount = (text) => [...text].length

/** Parses one front matter value: "quoted", [a, b], an integer, or plain text. */
function parseValue(raw) {
  if (raw.startsWith('[')) {
    if (!raw.endsWith(']')) throw new Error(`unclosed list: ${raw}`)
    const inner = raw.slice(1, -1).trim()
    return inner === '' ? [] : inner.split(',').map((item) => parseScalar(item.trim()))
  }
  if (/^-?[0-9]+$/.test(raw)) return Number(raw)
  return parseScalar(raw)
}

function parseScalar(raw) {
  if (raw.startsWith('"')) {
    if (raw.length < 2 || !raw.endsWith('"')) throw new Error(`unclosed quote: ${raw}`)
    return raw.slice(1, -1)
  }
  return raw
}

/** Splits preset.md into front matter fields and body sections. Throws on any format error. */
export function parsePreset(text) {
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

  const sections = []
  for (const line of lines.slice(end + 1)) {
    const heading = /^## (.+)$/.exec(line)
    if (heading) {
      sections.push({ heading: heading[1].trim(), lines: [] })
    } else if (sections.length === 0) {
      if (line.trim() !== '') throw new Error('text before ## Instructions')
    } else {
      sections[sections.length - 1].lines.push(line)
    }
  }
  return {
    fields,
    sections: sections.map((section) => ({
      heading: section.heading,
      text: section.lines.join('\n').trim(),
    })),
  }
}

/** True when `tag` (from a preset) matches `code` (selected): equal, or a prefix at a `-`. */
export function tagMatches(tag, code) {
  return code === tag || code.startsWith(`${tag}-`)
}

/** The text the model gets for one variant (or none). */
export function render(preset, variant) {
  const parts = [preset.instructions]
  if (variant) parts.push(`Notes for ${variant}:\n${preset.variants[variant]}`)
  if (preset.examples) parts.push(`Examples:\n${preset.examples}`)
  return parts.join('\n\n')
}

/** Checks a text field; a missing required key is reported by the caller. */
function checkText(fields, key, max, errors) {
  const value = fields[key]
  if (value === undefined) return
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${key} must be text`)
  else if (charCount(value) > max) errors.push(`${key} is longer than ${max} characters`)
}

function checkList(fields, key, errors) {
  const value = fields[key]
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${key} must be a non-empty list`)
    return []
  }
  if (value.some((item) => typeof item !== 'string' || item === '')) {
    errors.push(`${key} must hold text items`)
    return []
  }
  if (new Set(value).size !== value.length) errors.push(`${key} has duplicates`)
  return value
}

/** Validates one preset folder; returns { entry, errors }. */
export function validatePreset(folder, bytes, knownLanguages) {
  const errors = []
  if (bytes.length > MAX_FILE_BYTES) errors.push(`file is larger than ${MAX_FILE_BYTES} bytes`)
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { errors: ['file is not UTF-8'] }
  }
  let parsed
  try {
    parsed = parsePreset(text)
  } catch (error) {
    return { errors: [error.message] }
  }
  const { fields, sections } = parsed

  for (const key of Object.keys(fields)) {
    if (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) {
      errors.push(`unknown front matter key: ${key}`)
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in fields)) errors.push(`missing ${key}`)
  }

  const id = fields.id
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || id.length < 3 || id.length > 48) {
    errors.push('id must be a lowercase slug of 3 to 48 characters')
  } else if (id !== folder) {
    errors.push(`id "${id}" differs from its folder "${folder}"`)
  }
  checkText(fields, 'name', MAX_NAME_CHARS, errors)
  checkText(fields, 'summary', MAX_SUMMARY_CHARS, errors)
  checkText(fields, 'model_hint', MAX_HINT_CHARS, errors)
  checkText(fields, 'deprecated', MAX_HINT_CHARS, errors)
  if (!Number.isInteger(fields.version) || fields.version < 1) {
    errors.push('version must be a positive whole number')
  }
  if (fields.format !== PRESET_FORMAT) errors.push(`format must be ${PRESET_FORMAT}`)
  if (!TIERS.includes(fields.tier)) errors.push(`tier must be one of ${TIERS.join(', ')}`)
  if (fields.license !== LICENSE) errors.push(`license must be ${LICENSE}`)

  const languages = checkList(fields, 'languages', errors)
  for (const tag of languages) {
    const match = TAG_PATTERN.exec(tag)
    if (!match) errors.push(`language tag is not language[-Script][-REGION]: ${tag}`)
    else if (!(match[1] in knownLanguages)) {
      errors.push(`language ${match[1]} (in ${tag}) is not in language-codes.json`)
    }
    for (const other of languages) {
      if (other !== tag && tagMatches(tag, other)) {
        errors.push(`language ${other} is already covered by ${tag}`)
      }
    }
  }
  const appliesTo = checkList(fields, 'applies_to', errors)
  for (const operation of appliesTo) {
    if (!OPERATIONS.includes(operation)) errors.push(`unknown applies_to value: ${operation}`)
  }
  checkList(fields, 'authors', errors)

  // Body sections: Instructions, then Variant notes, then Examples.
  let instructions = null
  let examples = null
  const variants = {}
  let stage = 0
  for (const { heading, text: body } of sections) {
    const variant = /^Variant: (.+)$/.exec(heading)
    if (heading === 'Instructions') {
      if (stage !== 0) errors.push('## Instructions must come first, once')
      instructions = body
      stage = 1
    } else if (variant) {
      const tag = variant[1].trim()
      if (stage !== 1) errors.push(`## Variant: ${tag} must follow ## Instructions`)
      if (!TAG_PATTERN.test(tag)) errors.push(`variant tag is not well formed: ${tag}`)
      if (!languages.some((language) => tagMatches(language, tag))) {
        errors.push(`variant ${tag} is not covered by languages`)
      }
      if (tag in variants) errors.push(`variant ${tag} given twice`)
      if (charCount(body) > MAX_VARIANT_CHARS) {
        errors.push(`variant ${tag} is longer than ${MAX_VARIANT_CHARS} characters`)
      }
      if (body === '') errors.push(`variant ${tag} is empty`)
      variants[tag] = body
    } else if (heading === 'Examples') {
      if (stage === 0 || stage === 2) errors.push('## Examples must come last, once')
      if (body === '') errors.push('## Examples is empty')
      examples = body
      stage = 2
    } else {
      errors.push(`unknown section: ## ${heading}`)
    }
  }
  if (!instructions) errors.push('## Instructions is missing or empty')
  if (errors.length > 0) return { errors }

  const preset = { instructions, variants, examples }
  for (const variant of [null, ...Object.keys(variants)]) {
    const length = charCount(render(preset, variant))
    if (length > MAX_RENDERED_CHARS) {
      errors.push(
        `rendered text${variant ? ` for ${variant}` : ''} is ${length} characters (limit ${MAX_RENDERED_CHARS})`,
      )
    }
  }
  if (errors.length > 0) return { errors }

  const entry = {
    id,
    name: fields.name,
    version: fields.version,
    format: fields.format,
    tier: fields.tier,
    languages,
    variants: Object.keys(variants).sort(),
    applies_to: appliesTo,
    summary: fields.summary,
    authors: fields.authors,
    ...(fields.model_hint ? { model_hint: fields.model_hint } : {}),
    ...(fields.deprecated ? { deprecated: fields.deprecated } : {}),
    path: `${id}/preset.md`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
  return { entry, errors }
}

/** Validates every preset and returns the index text, or the list of problems. */
export function buildIndex() {
  const codes = JSON.parse(readFileSync(join(ROOT, 'language-codes.json'), 'utf8'))
  const problems = []
  const entries = []
  const folders = readdirSync(ROOT)
    .filter((name) => statSync(join(ROOT, name)).isDirectory())
    .sort()
  for (const folder of folders) {
    const file = join(ROOT, folder, 'preset.md')
    if (!existsSync(file)) {
      problems.push(`${folder}: missing preset.md`)
      continue
    }
    for (const name of readdirSync(join(ROOT, folder))) {
      if (!ALLOWED_FILES.includes(name)) problems.push(`${folder}: unexpected file ${name}`)
    }
    const { entry, errors } = validatePreset(folder, readFileSync(file), codes.languages)
    for (const error of errors) problems.push(`${folder}/preset.md: ${error}`)
    if (entry) entries.push(entry)
  }
  const ids = entries.map((entry) => entry.id)
  for (const id of new Set(ids)) {
    if (ids.filter((other) => other === id).length > 1) problems.push(`duplicate id: ${id}`)
  }
  const index = { format: INDEX_FORMAT, presets: entries }
  return { problems, text: `${JSON.stringify(index, null, 2)}\n` }
}

function main() {
  const check = process.argv.includes('--check')
  const { problems, text } = buildIndex()
  if (problems.length > 0) {
    for (const problem of problems) console.error(`error: ${problem}`)
    process.exit(1)
  }
  const current = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, 'utf8') : ''
  if (check) {
    if (current !== text) {
      console.error('error: presets/languages/index.json is out of date.')
      console.error('Run: node scripts/language-presets.mjs')
      process.exit(1)
    }
    console.log('Language presets are valid and index.json is up to date.')
    return
  }
  if (current !== text) writeFileSync(INDEX_PATH, text)
  console.log(`Wrote ${INDEX_PATH} (${JSON.parse(text).presets.length} presets).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
