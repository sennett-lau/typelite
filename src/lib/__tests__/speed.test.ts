import { describe, expect, it } from 'vitest'
import { useAppStore } from '../../stores/appStore'
import {
  addRun,
  currentPresets,
  formatMs,
  median,
  speedTip,
  typicalTimes,
  type StepId,
} from '../speed'
import { makeRun, TEST_PRESETS as PRESETS } from '../../test-utils/runTiming'

function steps(values: Partial<Record<StepId, number | null>>): Record<StepId, number | null> {
  return { recording: null, speech: null, ai: null, paste: null, ...values }
}

describe('median', () => {
  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([])).toBeNull()
    expect(median([5])).toBe(5)
    expect(median([9, 1, 5])).toBe(5)
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })

  it('is not pulled up by one slow cold start', () => {
    expect(median([300, 310, 320, 9000])).toBe(315)
  })
})

describe('typicalTimes', () => {
  it('uses only successful runs made with the current presets', () => {
    const runs = [
      makeRun({ id: 1, speechMs: 1000 }),
      makeRun({ id: 2, speechMs: 1400 }),
      makeRun({ id: 3, speechMs: 1200 }),
      makeRun({ id: 4, speechMs: 9000, outcome: 'stt_unreachable' }),
      makeRun({ id: 5, speechMs: 9000, speechModel: 'small' }),
      makeRun({ id: 6, speechMs: 9000, aiPresetId: 'ai-2' }),
      makeRun({ id: 7, speechMs: 9000, language: 'en' }),
    ]

    const typical = typicalTimes(runs, PRESETS)
    expect(typical?.runCount).toBe(3)
    expect(typical?.steps.speech).toBe(1200)
    expect(typical?.totalMs).toBe(1900)
  })

  it('takes each step only from the runs that had it', () => {
    const runs = [
      makeRun({ id: 1, aiMs: null, pasteMs: 300 }),
      makeRun({ id: 2, aiMs: 600 }),
      makeRun({ id: 3, mode: 'ask', aiMs: 800, pasteMs: null }),
    ]
    const typical = typicalTimes(runs, PRESETS)
    expect(typical?.steps.ai).toBe(700)
    expect(typical?.steps.paste).toBe(250)
  })

  it('shows AI as skipped when no matching run used it', () => {
    const typical = typicalTimes([makeRun({ aiMs: null })], PRESETS)
    expect(typical?.steps.ai).toBeNull()
  })

  it('is null when no run matches', () => {
    expect(typicalTimes([], PRESETS)).toBeNull()
    expect(typicalTimes([makeRun({ outcome: 'llm_failed' })], PRESETS)).toBeNull()
  })
})

describe('currentPresets', () => {
  it('reads the active presets and treats an empty language as auto', () => {
    const config = useAppStore.getInitialState().config
    const speech = config.speech_presets[0]
    const presets = currentPresets({
      ...config,
      speech_presets: [{ ...speech, language: '' }],
      active_speech_preset_id: speech.id,
    })
    expect(presets.speechPresetId).toBe(speech.id)
    expect(presets.speechModel).toBe(speech.model)
    expect(presets.language).toBe('auto')
    expect(presets.aiModel).toBe(config.ai_presets[0].model)
  })
})

describe('speedTip', () => {
  it('points at speech when it is over 60 % of the total', () => {
    expect(
      speedTip(steps({ recording: 100, speech: 1300, ai: 400, paste: 200 }), 2000, 'keyboard'),
    ).toBe('speech')
    expect(
      speedTip(steps({ recording: 100, speech: 1200, ai: 500, paste: 200 }), 2000, 'keyboard'),
    ).toBeNull()
  })

  it('points at AI when it is over 50 % of the total', () => {
    expect(
      speedTip(steps({ recording: 100, speech: 700, ai: 1100, paste: 100 }), 2000, 'keyboard'),
    ).toBe('ai')
  })

  it('points at paste when it takes over 300 ms and text is pasted from the clipboard', () => {
    const slowPaste = steps({ recording: 100, speech: 500, ai: 400, paste: 350 })
    expect(speedTip(slowPaste, 1350, 'clipboard')).toBe('paste')
    expect(speedTip(slowPaste, 1350, 'keyboard')).toBeNull()
    expect(speedTip(steps({ speech: 500, ai: 400, paste: 300 }), 1200, 'clipboard')).toBeNull()
  })

  it('checks the largest step first', () => {
    // Both rules hold in isolation only for the larger step here.
    expect(speedTip(steps({ speech: 5000, ai: 100, paste: 400 }), 5600, 'clipboard')).toBe('speech')
  })

  it('gives no tip without a total', () => {
    expect(speedTip(steps({}), 0, 'clipboard')).toBeNull()
  })
})

describe('formatMs', () => {
  it('uses ms below a second and seconds above', () => {
    expect(formatMs(85)).toBe('85 ms')
    expect(formatMs(999)).toBe('999 ms')
    expect(formatMs(1900)).toBe('1.9 s')
  })
})

describe('addRun', () => {
  it('drops a run it already has and keeps the last 50', () => {
    const runs = Array.from({ length: 50 }, (_, index) => makeRun({ id: index + 1 }))
    expect(addRun(runs, makeRun({ id: 50 }))).toBe(runs)
    const next = addRun(runs, makeRun({ id: 51 }))
    expect(next).toHaveLength(50)
    expect(next[0].id).toBe(2)
    expect(next[49].id).toBe(51)
  })
})
