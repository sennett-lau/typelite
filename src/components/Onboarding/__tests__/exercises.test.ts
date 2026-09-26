import { describe, expect, it } from 'vitest'
import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import {
  EXERCISES,
  SELECTION_TRANSLATE_PREFILL,
  SPEAK_TRANSLATE_LINE,
  checkExercise,
  insertedCharCount,
  insertedText,
  looksLikeLanguage,
  selectionTranslatePrefill,
  speakTranslateLine,
  wordDiff,
  wroteText,
} from '../exercises'
import type { CheckInput, ExerciseId } from '../exercises'
import { MISS_DELAY_MS, SETTLE_MS, decideDelay, exerciseView, skippedStatus } from '../exerciseFlow'

function input(overrides: Partial<CheckInput>): CheckInput {
  return {
    said: '',
    before: '',
    boxText: '',
    prefill: '',
    answer: null,
    target: 'en',
    ...overrides,
  }
}

/** A speak exercise whose run pasted `text` into an empty box. */
function pasted(id: ExerciseId, text: string, said = '', target = 'en') {
  return checkExercise(id, input({ boxText: text, said, target }))
}

describe('insertedText', () => {
  it('finds text typed at the end, in the middle, or over a selection', () => {
    expect(insertedText('', 'Hello.')).toBe('Hello.')
    expect(insertedText('First. ', 'First. Second.')).toBe('Second.')
    expect(insertedText('ab', 'aXYb')).toBe('XY')
    expect(insertedText('replace me', 'new text')).toBe('new text')
  })

  it('counts inserted characters as Rust does, spaces and CJK included', () => {
    expect(insertedCharCount('', 'Hello. ')).toBe(7)
    expect(insertedCharCount('First. ', 'First. Second.')).toBe(7)
    expect(insertedCharCount('今天下午三点开会', 'The meeting is at 3.')).toBe(20)
    expect(insertedCharCount('', '早晨😀')).toBe(3)
    expect(insertedCharCount('same', 'same')).toBe(0)
  })
})

describe('wordDiff (plan tutorial-one-page)', () => {
  const struck = (said: string, wrote: string) =>
    wordDiff(said, wrote)
      .filter((part) => part.removed)
      .map((part) => part.text.trim())

  it('strikes through the words the cleanup removed', () => {
    expect(
      struck(
        'Um so I think we should like ship it on Friday',
        'I think we should ship it on Friday.',
      ),
    ).toEqual(['Um so', 'like'])
    const parts = wordDiff("Let's have lunch at 1 oh no let's do it at 2", "Let's have lunch at 2.")
    expect(parts.map((part) => part.text).join('')).toContain("Let's have lunch")
    expect(
      parts
        .filter((part) => !part.removed)
        .map((part) => part.text)
        .join(''),
    ).toBe("Let's have lunch at 2.")
    expect(
      struck("Let's have lunch at 1 oh no let's do it at 2", "Let's have lunch at 2.").join(' '),
    ).toContain('oh no')
  })

  it('shows the written text alone when there is no transcript', () => {
    expect(wordDiff('', 'Hello there.')).toEqual([{ text: 'Hello there.', removed: false }])
    expect(wordDiff('', '')).toEqual([])
  })

  it('works per character for Chinese', () => {
    expect(struck('嗯我觉得周五发布吧', '我觉得周五发布吧。')).toEqual(['嗯'])
  })
})

describe('exercise states (plan tutorial-one-page)', () => {
  const view = (overrides: Partial<Parameters<typeof exerciseView>[0]>) =>
    exerciseView({ stage: 'idle', verdict: null, error: null, noSpeech: false, ...overrides })

  it('follows the run, and shows writing until the result is decided', () => {
    expect(view({})).toBe('ready')
    expect(view({ stage: 'listening' })).toBe('listening')
    expect(view({ stage: 'writing' })).toBe('writing')
    // Landed, but the paste may still be arriving: still writing.
    expect(view({ stage: 'landed' })).toBe('writing')
    expect(view({ stage: 'landed', verdict: 'success' })).toBe('success')
    expect(view({ stage: 'landed', verdict: 'miss' })).toBe('miss')
  })

  it('shows no speech and errors, but a success wins', () => {
    expect(view({ noSpeech: true })).toBe('noSpeech')
    expect(view({ error: 'offline' })).toBe('error')
    expect(view({ error: 'offline', verdict: 'success' })).toBe('success')
  })

  it('decides only after all inserted characters arrived and the box settled', () => {
    expect(decideDelay(null, 0)).toBe(0)
    expect(decideDelay(20, 20)).toBe(SETTLE_MS)
    expect(decideDelay(20, 21)).toBe(SETTLE_MS)
    expect(decideDelay(20, 7)).toBe(MISS_DELAY_MS)
    expect(SETTLE_MS).toBeLessThan(MISS_DELAY_MS)
  })

  it('keeps a passed exercise done when it is skipped', () => {
    expect(skippedStatus(undefined)).toBe('skipped')
    expect(skippedStatus('pending')).toBe('skipped')
    expect(skippedStatus('done')).toBe('done')
  })
})

describe('Dictate checks', () => {
  it('change of mind passes with lunch at 2 and fails when "at 1" is left', () => {
    expect(pasted('correction', "Let's have lunch at 2.")).toBe(true)
    expect(pasted('correction', "Let's have lunch at two.")).toBe(true)
    expect(pasted('correction', "Let's have lunch at 1, oh no, let's do it at 2.")).toBe(false)
    expect(pasted('correction', "Let's have lunch at 1.")).toBe(false)
    expect(pasted('correction', '')).toBe(false)
    expect(pasted('correction', '我们两点去吃午饭吧。')).toBe(true)
    expect(pasted('correction', '我们一点去吃午饭吧，改成两点吧。')).toBe(false)
  })

  it('fillers passes when the text mentions Friday', () => {
    expect(pasted('fillers', 'I think we should ship it on Friday.')).toBe(true)
    expect(pasted('fillers', '我觉得我们周五发布吧。')).toBe(true)
    expect(pasted('fillers', 'I think we should ship it.')).toBe(false)
  })

  it('only counts what this run added to the box', () => {
    expect(
      checkExercise(
        'correction',
        input({ before: "Let's have lunch at 1.", boxText: "Let's have lunch at 1. Lunch at 2." }),
      ),
    ).toBe(true)
  })
})

describe('Translate checks', () => {
  it('speak and translate passes when the translation differs from the transcript', () => {
    expect(
      pasted('speakTranslate', '早上好，我们明天下午可以见面吗？', 'Good morning', 'zh-Hans'),
    ).toBe(true)
    expect(
      pasted(
        'speakTranslate',
        'Good morning, can we meet tomorrow afternoon?',
        'good morning can we meet tomorrow afternoon',
        'zh-Hans',
      ),
    ).toBe(false)
    expect(pasted('speakTranslate', '', 'Good morning', 'zh-Hans')).toBe(false)
  })

  it('speak and translate accepts an unchanged line already in the target language', () => {
    expect(
      pasted(
        'speakTranslate',
        'Good morning, can we meet tomorrow afternoon?',
        'Good morning, can we meet tomorrow afternoon?',
        'en',
      ),
    ).toBe(true)
  })

  it('highlight and translate needs the box changed and in the target script', () => {
    const zhPrefill = SELECTION_TRANSLATE_PREFILL.zh
    const check = (boxText: string, target: string, prefill: string = zhPrefill) =>
      checkExercise('selectionTranslate', input({ before: prefill, boxText, prefill, target }))

    expect(check('The meeting is at 3 pm today.', 'en')).toBe(true)
    expect(check(zhPrefill, 'en')).toBe(false)
    expect(check('今天下午三點開會', 'en')).toBe(false)
    const enPrefill = SELECTION_TRANSLATE_PREFILL.en
    expect(check('会议今天下午三点开始。', 'zh-Hans', enPrefill)).toBe(true)
    expect(check('会議は今日の午後三時に始まります。', 'ja', enPrefill)).toBe(true)
    expect(check('会议今天下午三点开始。', 'ja', enPrefill)).toBe(false)
    expect(check('회의는 오늘 오후 3시에 시작합니다.', 'ko', enPrefill)).toBe(true)
    expect(check(enPrefill, 'fr', enPrefill)).toBe(false)
    expect(check('La réunion commence à trois heures cet après-midi.', 'fr', enPrefill)).toBe(true)
  })

  it('reads a line in another language than the first target (plan tutorial-one-page)', () => {
    expect(speakTranslateLine('en')).toBe('早晨，我哋聽日下晝可唔可以見面？')
    expect(speakTranslateLine('zh-Hant-HK')).toBe('Good morning, can we meet tomorrow afternoon?')
    expect(speakTranslateLine('ja')).toBe(SPEAK_TRANSLATE_LINE.en)
    expect(speakTranslateLine('')).toBe(SPEAK_TRANSLATE_LINE.en)
    // The check passes for a Cantonese line translated into English.
    expect(
      pasted(
        'speakTranslate',
        'Good morning, can we meet tomorrow afternoon?',
        SPEAK_TRANSLATE_LINE.yue,
        'en',
      ),
    ).toBe(true)
  })

  it('pre-fills a sentence in another language than the target', () => {
    expect(selectionTranslatePrefill('en')).toBe('今天下午三点开会')
    expect(selectionTranslatePrefill('zh-Hans')).toBe('The meeting starts at three this afternoon.')
    expect(selectionTranslatePrefill('ja')).toBe('The meeting starts at three this afternoon.')
    expect(looksLikeLanguage(selectionTranslatePrefill('zh-Hant-HK'), 'zh-Hant-HK')).toBe(false)
  })
})

describe('Ask checks', () => {
  it('a question passes when an answer appeared', () => {
    expect(checkExercise('question', input({ answer: '15% of 240 is 36.' }))).toBe(true)
    expect(checkExercise('question', input({ answer: '' }))).toBe(false)
    expect(checkExercise('question', input({ answer: null }))).toBe(false)
  })

  it('an edit passes when the selection was replaced by a shorter version', () => {
    const prefill = en.onboarding.exercises.edit.prefill
    const edit = (overrides: Partial<CheckInput>) =>
      checkExercise('edit', input({ prefill, before: prefill, boxText: prefill, ...overrides }))

    // Expected: replaced in place.
    expect(edit({ boxText: 'Did you get a chance to look at my draft?' })).toBe(true)
    expect(wroteText('edit', input({ prefill, boxText: 'Seen my draft?', answer: null }))).toBe(
      'Seen my draft?',
    )
    // A replacement that is not shorter fails, even if the panel has a shorter answer.
    expect(edit({ boxText: `${prefill} Thanks so much!`, answer: 'Short.' })).toBe(false)
    // Fallback: the replacement could not be made, so the shorter text is in the panel.
    expect(edit({ answer: 'Had a chance to look at my draft?' })).toBe(true)
    expect(edit({})).toBe(false)
    expect(edit({ boxText: `${prefill} Thanks so much!` })).toBe(false)
    expect(edit({ answer: `${prefill} And one more thing, thanks!` })).toBe(false)
    expect(wroteText('edit', input({ prefill, boxText: prefill, answer: 'Short.' }))).toBe('Short.')
  })
})

describe('exercise texts', () => {
  const ids = Object.values(EXERCISES).flatMap((list) => list.map((exercise) => exercise.id))

  it('have Chinese scripts and pre-filled text for the Chinese UI', () => {
    const han = /\p{Script=Han}/u
    for (const id of ids) {
      const texts = zh.onboarding.exercises[id] as Record<string, string>
      expect(han.test(texts.title), id).toBe(true)
      if ('script' in texts) expect(han.test(texts.script), id).toBe(true)
    }
    expect(han.test(zh.onboarding.exercises.edit.prefill)).toBe(true)
  })

  it('pass their own checks for the expected Chinese results', () => {
    expect(pasted('correction', '我们两点去吃午饭吧。')).toBe(true)
    const prefill = zh.onboarding.exercises.edit.prefill
    expect(
      checkExercise(
        'edit',
        input({ prefill, boxText: prefill, answer: '你有空看一下我上周发的草稿吗？不急。' }),
      ),
    ).toBe(true)
  })

  it('English scripts match the plan', () => {
    expect(en.onboarding.exercises.correction.script).toContain('lunch at 1')
    expect(en.onboarding.exercises.fillers.script).toContain('Friday')
    expect(en.onboarding.exercises.question.script).toBe(
      'What is fifteen percent of two hundred forty?',
    )
  })
})
