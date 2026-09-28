/**
 * Plan `docs-structure`: the generated language preset catalogue is up to date. Plan
 * `model-guides`: the language guides are valid and their index matches them. Fix a failure with
 * `npm run docs:cards`. Step folders (speech, AI polish) share one format, and every relative
 * link resolves.
 */
import { describe, expect, it } from 'vitest'
import {
  checkDocs,
  headingAnchor,
  STEPS,
  validateServiceRow,
  LANGUAGE_GUIDES,
  parseCard,
  renderLanguageGuides,
  replaceBetweenMarkers,
  validateLanguageGuide,
} from '../../../scripts/docs-cards.mjs'

const GUIDE_BODY =
  '## Recommended setup\n\nA table.\n\n## Why\n\nText.\n\n## Set it up\n\n1. Steps.\n'

describe('docs cards', () => {
  it('every language guide is valid and every generated table is up to date', () => {
    expect(checkDocs()).toEqual([])
  })

  it('rejects values that are not plain YAML text', () => {
    const text = (value: string) => `---\nid: example\nnotes: ${value}\n---\n\nBody.\n`
    expect(parseCard(text('Plain text')).fields.notes).toBe('Plain text')
    expect(() => parseCard(text('Qwen3 models: turn it off'))).toThrow(/plain YAML/)
    expect(() => parseCard(text('[a, b]'))).toThrow(/plain YAML/)
  })

  it('replaces only the text between the markers', () => {
    const text = 'before\n<!-- BEGIN GENERATED: x -->\nold\n<!-- END GENERATED: x -->\nafter\n'
    const result = replaceBetweenMarkers(text, 'x', 'new')
    expect(result.startsWith('before\n<!-- BEGIN GENERATED: x -->\n')).toBe(true)
    expect(result).toContain('\nnew\n')
    expect(result).not.toContain('old')
    expect(result.endsWith('<!-- END GENERATED: x -->\nafter\n')).toBe(true)
    expect(() => replaceBetweenMarkers('no markers', 'x', 'new')).toThrow(/markers/)
  })

  describe('language guides', () => {
    const guide = (extra = '', body = GUIDE_BODY) => `---
id: example
language: Example (Region)
codes: zh-Hant-HK, yue
speech: Qwen3-ASR-1.7B
polish: By hardware
tier: community
authors: someone
preset: cantonese-hong-kong
${extra}---

${body}`
    const guideProblems = (text: string, id = 'example') => {
      const { fields, body } = parseCard(text)
      return validateLanguageGuide(id, fields, body)
    }

    it('accepts a well-formed guide', () => {
      expect(guideProblems(guide('tested: 2026-09-27\n'))).toEqual([])
    })

    it('rejects missing sections and unknown keys', () => {
      expect(guideProblems(guide('', '## Why\n\nText.\n'))).toEqual([
        'missing section "## Recommended setup"',
        'missing section "## Set it up"',
      ])
      expect(guideProblems(guide('colour: blue\n'))).toContain('unknown front matter key: colour')
    })

    it('rejects a preset that does not exist, bad codes and a bad date', () => {
      const text = guide('tested: yesterday\n')
        .replace('preset: cantonese-hong-kong', 'preset: no-such-preset')
        .replace('codes: zh-Hant-HK, yue', 'codes: zh-Hant-HK, Cantonese!')
      expect(guideProblems(text)).toEqual([
        'codes: "Cantonese!" is not a language tag such as zh-Hant-HK',
        'preset "no-such-preset" is not a folder in presets/languages/',
        'tested must be a date such as 2026-09-27',
      ])
    })

    // The index sits on the Languages page, in the same folder as the guides.
    it('links each guide by file name from the Languages page', () => {
      expect(LANGUAGE_GUIDES.dir).toBe('docs/guides/languages')
      expect(LANGUAGE_GUIDES.table).toBe('docs/guides/languages/README.md')
      const table = renderLanguageGuides([
        {
          file: 'cantonese.md',
          language: 'Cantonese (Hong Kong)',
          codes: 'zh-Hant-HK, yue',
          speech: 'Qwen3-ASR-1.7B',
          polish: 'By hardware',
          tier: 'official',
          preset: 'cantonese-hong-kong',
          tested: '2026-09-27',
        },
      ])
      expect(table).toContain('| [Cantonese (Hong Kong)](cantonese.md) |')
      expect(table).toContain('(../../../presets/languages/cantonese-hong-kong/preset.md)')
    })
  })

  describe('step folders', () => {
    const row = (runs = 'Cloud', key = 'Yes', address = '`https://api.example.com/v1`') =>
      `| [Example](openai-compatible.md#cloud-services) | ${runs} | Paid | ${key} | ${address} | \`m\` | |`

    it('lists speech and AI polish', () => {
      expect(STEPS.map((step) => step.id)).toEqual(['speech', 'ai-polish'])
    })

    it('accepts a well-formed Services row', () => {
      expect(validateServiceRow(row())).toEqual([])
      expect(validateServiceRow(row('On your computer', 'No', '—'))).toEqual([])
    })

    it('rejects bad values, a keyless cloud service and an address with the added path', () => {
      expect(validateServiceRow(row('Somewhere'))).toContain(
        'Example: Runs must be one of On your computer, Your computer or network, Your network, Cloud',
      )
      expect(validateServiceRow(row('Cloud', 'No'))).toContain(
        'Example: a cloud service needs a key',
      )
      expect(
        validateServiceRow(row('Cloud', 'Yes', '`https://api.example.com/v1/chat/completions`')),
      ).toContain('Example: Address must stop before the path Typelite adds')
      expect(validateServiceRow('| a | b |')[0]).toMatch(/needs 7 cells/)
    })
  })

  it('makes GitHub heading anchors', () => {
    expect(headingAnchor('Slow or empty answers: check thinking first')).toBe(
      'slow-or-empty-answers-check-thinking-first',
    )
    expect(headingAnchor('llama.cpp server')).toBe('llamacpp-server')
  })
})
