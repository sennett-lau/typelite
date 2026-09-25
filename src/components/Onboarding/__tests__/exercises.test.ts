import { describe, expect, it } from 'vitest'
import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import {
  EXERCISES,
  SELECTION_TRANSLATE_PREFILL,
  checkExercise,
  insertedText,
  looksLikeLanguage,
  mentions36,
  selectionTranslatePrefill,
  wroteText,
} from '../exercises'
import type { CheckInput, ExerciseId } from '../exercises'
import {
  exerciseFlowReducer,
  flowComplete,
  flowFinished,
  initialExerciseFlow,
} from '../exerciseFlow'
import type { ExerciseFlowAction, ExerciseFlowState } from '../exerciseFlow'

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

  it('pre-fills a sentence in another language than the target', () => {
    expect(selectionTranslatePrefill('en')).toBe('今天下午三点开会')
    expect(selectionTranslatePrefill('zh-Hans')).toBe('The meeting starts at three this afternoon.')
    expect(selectionTranslatePrefill('ja')).toBe('The meeting starts at three this afternoon.')
    expect(looksLikeLanguage(selectionTranslatePrefill('zh-Hant-HK'), 'zh-Hant-HK')).toBe(false)
  })
})

describe('Ask checks', () => {
  it('a question passes when an answer appeared, and notes 36', () => {
    expect(checkExercise('question', input({ answer: '15% of 240 is 36.' }))).toBe(true)
    expect(checkExercise('question', input({ answer: '' }))).toBe(false)
    expect(checkExercise('question', input({ answer: null }))).toBe(false)
    // Typed at the cursor instead of the panel.
    expect(checkExercise('question', input({ boxText: '36' }))).toBe(true)
    expect(mentions36('15% of 240 is 36.')).toBe(true)
    expect(mentions36('答案是三十六。')).toBe(true)
    expect(mentions36('It is 360.')).toBe(false)
    expect(mentions36(null)).toBe(false)
  })

  it('an edit passes when the selection became shorter, in the box or the answer', () => {
    const prefill = en.onboarding.exercises.edit.prefill
    const edit = (overrides: Partial<CheckInput>) =>
      checkExercise('edit', input({ prefill, before: prefill, boxText: prefill, ...overrides }))

    expect(edit({ boxText: 'Did you get a chance to look at my draft?' })).toBe(true)
    expect(edit({ answer: 'Had a chance to look at my draft?' })).toBe(true)
    expect(edit({})).toBe(false)
    expect(edit({ boxText: `${prefill} Thanks so much!` })).toBe(false)
    expect(edit({ answer: `${prefill} And one more thing, thanks!` })).toBe(false)
    expect(wroteText('edit', input({ prefill, boxText: prefill, answer: 'Short.' }))).toBe('Short.')
  })
})

describe('exercise flow', () => {
  const run = (state: ExerciseFlowState, ...actions: ExerciseFlowAction[]) =>
    actions.reduce(exerciseFlowReducer, state)

  it('marks a passed exercise done and moves on with Next', () => {
    const state = run(
      initialExerciseFlow(2),
      { type: 'runStarted' },
      { type: 'result', passed: true },
    )
    expect(state.phase).toBe('success')
    expect(state.statuses).toEqual(['done', 'pending'])
    expect(flowComplete(state)).toBe(false)

    const next = run(state, { type: 'next' })
    expect(next.index).toBe(1)
    expect(next.phase).toBe('ready')
    expect(next.attempt).toBeGreaterThan(state.attempt)
  })

  it('a miss stays pending, a new run clears it, and Try again resets the card', () => {
    const missed = run(
      initialExerciseFlow(2),
      { type: 'runStarted' },
      { type: 'result', passed: false },
    )
    expect(missed.phase).toBe('miss')
    expect(missed.statuses).toEqual(['pending', 'pending'])
    expect(run(missed, { type: 'next' })).toBe(missed)
    expect(run(missed, { type: 'runStarted' }).phase).toBe('running')

    const retried = run(missed, { type: 'retry' })
    expect(retried.phase).toBe('ready')
    expect(retried.index).toBe(0)
    expect(retried.attempt).toBe(missed.attempt + 1)
    expect(run(retried, { type: 'result', passed: true }).statuses[0]).toBe('done')
  })

  it('a success is not undone by a later miss', () => {
    const state = run(
      initialExerciseFlow(1),
      { type: 'result', passed: true },
      { type: 'result', passed: false },
    )
    expect(state.phase).toBe('success')
  })

  it('skipping every exercise completes the step', () => {
    const state = run(initialExerciseFlow(2), { type: 'skip' }, { type: 'skip' })
    expect(state.statuses).toEqual(['skipped', 'skipped'])
    expect(flowComplete(state)).toBe(true)
    expect(flowFinished(state)).toBe(true)
  })

  it('completes with one done and one skipped, and Practise again keeps them', () => {
    const state = run(
      initialExerciseFlow(2),
      { type: 'result', passed: true },
      { type: 'next' },
      { type: 'skip' },
    )
    expect(state.statuses).toEqual(['done', 'skipped'])
    expect(flowComplete(state)).toBe(true)
    const again = run(state, { type: 'restart' })
    expect(again.index).toBe(0)
    expect(flowFinished(again)).toBe(false)
    expect(flowComplete(again)).toBe(true)
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
    expect(zh.onboarding.exercises.speakTranslate.script).toBe('早上好，我们明天下午可以见面吗？')
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
