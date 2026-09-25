import type { CurrentPresets, RunTiming } from '../lib/speed'

/** Presets the fake runs below were made with. */
export const TEST_PRESETS: CurrentPresets = {
  speechPresetId: 'speech-1',
  speechModel: 'large-v3-turbo',
  language: 'auto',
  aiPresetId: 'ai-1',
  aiModel: 'qwen3:4b',
}

/** A successful Dictate run: 100 ms finish, 1.2 s speech, 400 ms AI, 200 ms paste. */
export function makeRun(overrides: Partial<RunTiming> = {}): RunTiming {
  return {
    id: 1,
    mode: 'dictate',
    recordingSecs: 4.2,
    audioBytes: 134_444,
    finishRecordingMs: 100,
    speechMs: 1200,
    aiMs: 400,
    pasteMs: 200,
    totalMs: 1900,
    speechPresetId: TEST_PRESETS.speechPresetId,
    speechModel: TEST_PRESETS.speechModel,
    aiPresetId: TEST_PRESETS.aiPresetId,
    aiModel: TEST_PRESETS.aiModel,
    language: TEST_PRESETS.language,
    outcome: 'ok',
    ...overrides,
  }
}
