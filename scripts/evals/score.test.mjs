// Plan `language-evals`: unit tests for the scorers and the dataset check (offline).
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { validate } from './dataset.mjs'
import { compare, summarise } from './report.mjs'
import {
  chineseScript,
  contains,
  errorRate,
  numbers,
  scorePolish,
  scoreSpeech,
  sentenceBreaks,
  tokens,
} from './score.mjs'

const EN = { unit: 'word', fillers: ['um', 'uh', 'er'] }
const YUE = { unit: 'char', dialect: 'yue', fillers: ['呃', '嗯'] }
const ZH = { unit: 'char', dialect: 'cmn', fillers: ['嗯'] }

describe('error rates', () => {
  it('ignores case and punctuation and counts words or characters', () => {
    expect(errorRate('Send it to Mary.', 'send it to mary', 'word')).toBe(0)
    expect(errorRate('Send it to Mary', 'Send it to John', 'word')).toBe(0.25)
    expect(errorRate('我今日好忙', '我今天好忙', 'char')).toBe(0.2)
    expect(tokens('1. Milk\n2. Eggs', 'word')).toEqual(['milk', 'eggs'])
  })
})

describe('numbers and words', () => {
  it('finds digit numbers but not list markers', () => {
    expect(numbers('1. Set it to 5.5\n2. Use 1,000 and 3:30')).toEqual(['1000', '3:30', '5.5'])
  })
  it('matches ASCII needles as whole words, also inside Chinese', () => {
    expect(contains('Summary of the call', 'um')).toBe(false)
    expect(contains('Um, okay', 'um')).toBe(true)
    expect(contains('個server又死咗', 'server')).toBe(true)
    expect(contains('呃我哋', '呃')).toBe(true)
  })
  it('counts sentence breaks inside the text only', () => {
    expect(sentenceBreaks('One. Two. Three.')).toBe(2)
    expect(sentenceBreaks('Is it on? No, it is not.')).toBe(1)
    expect(sentenceBreaks('我食咗飯。你呢？')).toBe(1)
    expect(sentenceBreaks('Version 2.1 is out')).toBe(0)
  })
  it('tells Simplified from Traditional', () => {
    expect(chineseScript('我们这个会议')).toBe('simplified')
    expect(chineseScript('我們這個會議')).toBe('traditional')
    expect(chineseScript('hello')).toBe(null)
  })
})

describe('polish scoring', () => {
  const correction = {
    expected: 'The deadline is Monday',
    must_contain: ['Monday'],
    must_not_contain: ['Friday'],
    tags: ['self-correction'],
  }
  it('passes a matching answer and fails a kept correction', () => {
    expect(scorePolish(correction, 'The deadline is Monday.', EN).pass).toBe(true)
    const kept = scorePolish(correction, 'The deadline is Friday, no wait, Monday.', EN)
    expect(kept.pass).toBe(false)
    expect(kept.failed.map(([name]) => name)).toContain('must_not_contain')
  })
  it('flags a filler left in, a dash and a lost number', () => {
    const c = { expected: 'Set the timeout to 5.5 seconds', tags: ['numbers'] }
    expect(scorePolish(c, 'Um, set the timeout to 5.5 seconds', EN).failed.map(([n]) => n)).toEqual(
      ['filler'],
    )
    expect(scorePolish(c, 'Set the timeout — to 5.5 seconds', EN).failed.map(([n]) => n)).toContain(
      'dash',
    )
    expect(
      scorePolish(c, 'Set the timeout to five point five seconds', EN).failed.map(([n]) => n),
    ).toContain('numbers')
  })
  it('wants the list layout of the reference, or an accepted alternative', () => {
    const c = {
      expected: 'Three things:\n1. Tests\n2. Docs\n3. A date',
      accept: ['Three things: tests, docs and a date'],
      tags: ['list'],
    }
    expect(scorePolish(c, 'Three things:\n1. Tests\n2. Docs\n3. A date', EN).pass).toBe(true)
    expect(scorePolish(c, 'Three things: tests, docs and a date', EN).pass).toBe(true)
    expect(scorePolish(c, 'Three things:\n- Tests\n- Docs\nA date', EN).pass).toBe(false)
  })
  it('checks punctuation only for cases tagged punctuation', () => {
    const c = { expected: 'It was down. We restarted it.', tags: ['punctuation'] }
    expect(scorePolish(c, 'It was down, we restarted it', EN).failed.map(([n]) => n)).toEqual([
      'punctuation',
    ])
    expect(scorePolish({ ...c, tags: [] }, 'It was down, we restarted it', EN).pass).toBe(true)
  })
  it('keeps Cantonese Cantonese and the script of the reference', () => {
    const c = { expected: '佢唔喺屋企，你遲啲再打俾佢啦', tags: ['dialect'] }
    expect(scorePolish(c, '佢唔喺屋企，你遲啲再打俾佢啦', YUE).pass).toBe(true)
    const mandarin = scorePolish(c, '他不在家，你晚一点再给他打电话吧', YUE)
    expect(mandarin.failed.map(([n]) => n)).toEqual(expect.arrayContaining(['script', 'error']))
    const zh = { expected: '我今天很忙，没空吃饭', tags: ['dialect'] }
    expect(scorePolish(zh, '我今日好忙，唔得閒食飯', ZH).failed.map(([n]) => n)).toContain(
      'dialect',
    )
  })
})

describe('speech scoring', () => {
  it('scores in the reference script and reports a script mismatch apart', () => {
    const clip = { text: '我哋已經將文件發咗俾客。' }
    const answer = { output: '我哋已经将文件发咗俾客', as_hong_kong: '我哋已經將文件發咗俾客' }
    const score = scoreSpeech(clip, answer, YUE)
    expect(score.pass).toBe(true)
    expect(score.error).toBe(0)
    expect(score.raw_error).toBeGreaterThan(0)
    expect(score.failed.map(([n]) => n)).toEqual(['script'])
  })
})

describe('summary and baseline', () => {
  const cases = [
    {
      id: 'a',
      lang: 'en',
      tags: ['filler'],
      pass_rate: 1,
      mean_error: 0,
      samples: [{ failed: [] }],
    },
    {
      id: 'b',
      lang: 'en',
      tags: ['numbers'],
      pass_rate: 0,
      mean_error: 0.5,
      samples: [{ failed: [['numbers', '']] }],
    },
  ]
  it('aggregates by language, tag and check', () => {
    const s = summarise(cases)
    expect(s.languages.en.pass_rate).toBe(0.5)
    expect(s.tags.numbers.en.pass_rate).toBe(0)
    expect(s.failed_checks.numbers.en).toBe(1)
  })
  it('lists regressions against a baseline', () => {
    const results = { cases, summary: summarise(cases) }
    const c = compare(results, { model: 'm', cases: { a: { pass_rate: 1 }, b: { pass_rate: 1 } } })
    expect(c.regressions.map((r) => r.id)).toEqual(['b'])
    expect(c.languages.en.delta).toBe(-0.5)
  })
})

describe('dataset check', () => {
  const root = () => {
    const dir = mkdtempSync(join(tmpdir(), 'typelite-evals-'))
    writeFileSync(
      join(dir, 'languages.json'),
      JSON.stringify({ en: { unit: 'word', fillers: ['um'] } }),
    )
    mkdirSync(join(dir, 'polish', 'en'), { recursive: true })
    return dir
  }
  const line = (c) =>
    JSON.stringify({ input: 'x', expected: 'X', tags: ['filler'], split: 'dev', ...c })

  it('accepts a valid case', () => {
    const dir = root()
    writeFileSync(join(dir, 'polish', 'en', 'dev.jsonl'), line({ id: 'en-1' }) + '\n')
    expect(validate(dir)).toEqual([])
  })
  it('rejects duplicate ids, unknown tags, a wrong split and an answer that fails its own checks', () => {
    const dir = root()
    writeFileSync(
      join(dir, 'polish', 'en', 'dev.jsonl'),
      [
        line({ id: 'en-1' }),
        line({ id: 'en-1' }),
        line({ id: 'en-2', tags: ['nope'] }),
        line({ id: 'en-3', split: 'holdout' }),
        line({ id: 'en-4', expected: 'um, hello', must_contain: ['bye'] }),
      ].join('\n'),
    )
    const errors = validate(dir).join('\n')
    expect(errors).toMatch(/id "en-1" also used/)
    expect(errors).toMatch(/unknown tag "nope"/)
    expect(errors).toMatch(/split "holdout" but file is dev.jsonl/)
    expect(errors).toMatch(/must_contain: bye/)
  })
  it('needs speech audio to exist unless it is synthetic', () => {
    const dir = root()
    mkdirSync(join(dir, 'speech', 'en'), { recursive: true })
    const clip = {
      id: 'sp-1',
      audio: 'audio/a.wav',
      text: 'Hi',
      tags: ['clean'],
      source: 'recording',
      licence: 'CC0-1.0',
      speaker: 'volunteer 1',
      split: 'dev',
    }
    writeFileSync(join(dir, 'speech', 'en', 'manifest.jsonl'), JSON.stringify(clip) + '\n')
    expect(validate(dir).join('\n')).toMatch(/audio\/a.wav does not exist/)
  })
})
