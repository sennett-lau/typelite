import { describe, expect, it } from 'vitest'
import { useAppStore } from '../../stores/appStore'
import {
  addRun,
  aiPresetSpeeds,
  averageTimes,
  currentPresets,
  formatMs,
  mean,
  median,
  RUN_CAPACITY,
  speechPresetSpeeds,
  speedTip,
  trimmedMean,
  type StepId,
} from '../speed'
import { makeRun } from '../../test-utils/runTiming'

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

describe('mean', () => {
  it('averages the values and is null for none', () => {
    expect(mean([])).toBeNull()
    expect(mean([5])).toBe(5)
    expect(mean([1, 2, 6])).toBe(3)
  })
})

describe('averageTimes', () => {
  it('averages every finished run whatever preset it used, leaving out failed runs', () => {
    const runs = [
      makeRun({ id: 1, speechMs: 1000 }),
      makeRun({ id: 2, speechMs: 1400, speechModel: 'small' }),
      makeRun({ id: 3, speechMs: 1200, aiPresetId: 'ai-2', language: 'en' }),
      makeRun({ id: 4, speechMs: 9000, outcome: 'stt_unreachable' }),
    ]

    const average = averageTimes(runs)
    expect(average?.runCount).toBe(3)
    expect(average?.steps.speech).toBe(1200)
    expect(average?.steps.ai).toBe(400)
    expect(average?.steps.paste).toBe(200)
  })

  it('takes each step only from the runs that had it', () => {
    const runs = [
      makeRun({ id: 1, aiMs: null, pasteMs: 300 }),
      makeRun({ id: 2, aiMs: 600, pasteMs: 100 }),
      makeRun({ id: 3, mode: 'ask', aiMs: 900, pasteMs: null }),
    ]
    const average = averageTimes(runs)
    expect(average?.steps.ai).toBe(750)
    expect(average?.steps.paste).toBe(200)
  })

  it('totals speech, AI and paste only, without finish recording', () => {
    const average = averageTimes([makeRun({ finishRecordingMs: 500 })])
    expect(average?.totalMs).toBe(1200 + 400 + 200)
  })

  it('has no AI average when no finished run used AI', () => {
    const average = averageTimes([makeRun({ aiMs: null })])
    expect(average?.steps.ai).toBeNull()
    expect(average?.totalMs).toBe(1400)
  })

  it('is null when no run finished', () => {
    expect(averageTimes([])).toBeNull()
    expect(averageTimes([makeRun({ outcome: 'llm_failed' })])).toBeNull()
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
  it('drops a run it already has and keeps the last 200', () => {
    expect(RUN_CAPACITY).toBe(200)
    const runs = Array.from({ length: RUN_CAPACITY }, (_, index) => makeRun({ id: index + 1 }))
    expect(addRun(runs, makeRun({ id: 200 }))).toBe(runs)
    const next = addRun(runs, makeRun({ id: 201 }))
    expect(next).toHaveLength(RUN_CAPACITY)
    expect(next[0].id).toBe(2)
    expect(next[RUN_CAPACITY - 1].id).toBe(201)
  })
})

describe('trimmedMean', () => {
  it('is the plain mean below three values', () => {
    expect(trimmedMean([])).toBeNull()
    expect(trimmedMean([400])).toBe(400)
    expect(trimmedMean([400, 600])).toBe(500)
  })

  it('drops the slowest value from three on, one per ten values', () => {
    // A cold first run after a model load does not count.
    expect(trimmedMean([9000, 400, 500])).toBe(450)
    expect(trimmedMean([...Array(19).fill(100), 5000])).toBe(100)
    expect(trimmedMean([...Array(18).fill(100), 5000, 6000])).toBe(100)
  })
})

describe('aiPresetSpeeds', () => {
  it('groups finished runs that used AI by preset and model, fastest first', () => {
    const runs = [
      ...[300, 400, 500].map((aiMs, i) =>
        makeRun({ id: i + 1, aiPresetId: 'slow', aiMs: aiMs * 2 }),
      ),
      ...[300, 400, 500].map((aiMs, i) => makeRun({ id: i + 10, aiPresetId: 'fast', aiMs })),
      makeRun({ id: 20, aiPresetId: 'fast', aiMs: 50, outcome: 'llm_failed' }),
      makeRun({ id: 21, aiPresetId: 'fast', aiMs: null }),
      makeRun({ id: 22, aiPresetId: 'fast', aiModel: 'other-model', aiMs: 100 }),
    ]

    const speeds = aiPresetSpeeds(runs)
    expect(speeds.map((speed) => [speed.presetId, speed.model, speed.runCount])).toEqual([
      ['fast', 'qwen3:4b', 3],
      ['slow', 'qwen3:4b', 3],
      ['fast', 'other-model', 1],
    ])
    // Trimmed: the slowest of three is left out.
    expect(speeds[0].average).toBe(350)
    expect(speeds[0].fastest).toBe(true)
    expect(speeds[1].average).toBe(700)
    expect(speeds[1].fastest).toBe(false)
    // Fewer than three runs: listed, not ranked.
    expect(speeds[2].average).toBeNull()
    expect(speeds[2].fastest).toBe(false)
  })

  it('gives no Fastest tag when only one preset is ranked', () => {
    const runs = [1, 2, 3].map((id) => makeRun({ id }))
    const speeds = aiPresetSpeeds(runs)
    expect(speeds).toHaveLength(1)
    expect(speeds[0].fastest).toBe(false)
  })
})

describe('speechPresetSpeeds', () => {
  it('ranks by recognition time per second of audio', () => {
    const runs = [
      // 2000 ms for 4 s of audio = 500 ms per second.
      ...[1, 2, 3].map((id) =>
        makeRun({ id, speechPresetId: 'server', speechMs: 2000, recordingSecs: 4 }),
      ),
      // 1000 ms for 1 s = 1000 ms per second: slower although each run was shorter.
      ...[4, 5, 6].map((id) =>
        makeRun({ id, speechPresetId: 'builtin', speechMs: 1000, recordingSecs: 1 }),
      ),
      makeRun({ id: 7, speechPresetId: 'server', recordingSecs: 0 }),
    ]

    const speeds = speechPresetSpeeds(runs)
    expect(speeds.map((speed) => [speed.presetId, speed.average, speed.runCount])).toEqual([
      ['server', 500, 3],
      ['builtin', 1000, 3],
    ])
    expect(speeds[0].fastest).toBe(true)
  })
})
