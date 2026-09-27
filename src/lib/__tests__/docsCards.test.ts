/**
 * Plan `docs-structure`: the service cards are valid and the generated tables in the guides (and
 * the language preset catalogue) match them. Plan `model-guides`: so are the language guides and
 * their index. Fix a failure with `npm run docs:cards`.
 */
import { describe, expect, it } from 'vitest'
import {
  CARD_SETS,
  checkDocs,
  parseCard,
  replaceBetweenMarkers,
  validateCard,
  validateLanguageGuide,
} from '../../../scripts/docs-cards.mjs'

const GUIDE_BODY =
  '## Recommended setup\n\nA table.\n\n## Why\n\nText.\n\n## Set it up\n\n1. Steps.\n'

const speech = CARD_SETS.find((set) => set.id === 'speech-services')!
const ai = CARD_SETS.find((set) => set.id === 'ai-polish-services')!

const card = (extra = '') => `---
id: example
name: Example
connection: openai-compatible
address: https://api.example.com/v1
model: example-1
needs_key: true
runs: cloud
cost: paid
${extra}---

Setup steps.
`

function problems(set: typeof speech, text: string, id = 'example') {
  const { fields, body } = parseCard(text)
  return validateCard(set, id, fields, body)
}

describe('docs cards', () => {
  it('every card is valid and every generated table is up to date', () => {
    expect(checkDocs()).toEqual([])
  })

  it('accepts a well-formed card', () => {
    expect(problems(speech, card())).toEqual([])
  })

  it('rejects a card whose id differs from its file name', () => {
    expect(problems(speech, card(), 'other')).toContain(
      'id "example" differs from its file "other.md"',
    )
  })

  it('rejects a connection the code does not have', () => {
    const text = card().replace('connection: openai-compatible', 'connection: qwen-cloud')
    expect(problems(speech, text)).toEqual([])
    expect(problems(ai, text)).toContain('connection must be one of builtin, openai-compatible')
  })

  it('rejects an address that includes the path Typelite adds', () => {
    const text = card().replace('/v1', '/v1/audio/transcriptions')
    expect(problems(speech, text)).toContain('address must stop before /audio/transcriptions')
  })

  it('rejects unknown keys, and thinking_off outside AI cards', () => {
    expect(problems(speech, card('colour: blue\n'))).toContain('unknown front matter key: colour')
    expect(problems(speech, card('thinking_off: Pick an instruct model.\n'))).toContain(
      'unknown front matter key: thinking_off',
    )
    expect(problems(ai, card('thinking_off: Pick an instruct model.\n'))).toEqual([])
  })

  it('rejects values that are not plain YAML text', () => {
    expect(() => parseCard(card('notes: Qwen3 models: turn it off\n'))).toThrow(/plain YAML/)
    expect(() => parseCard(card('notes: [a, b]\n'))).toThrow(/plain YAML/)
  })

  it('rejects a card without setup text', () => {
    expect(problems(speech, card().replace('Setup steps.\n', ''))).toContain(
      'the card needs a few lines of setup below the front matter',
    )
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
  })
})
