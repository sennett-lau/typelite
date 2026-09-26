/**
 * Plans `speed-board`, `home-refresh` and `speed-by-preset`: the numbers behind Home's Insights.
 * The backend keeps the last 200 runs (durations only, never text) in a small file in the app
 * data folder and sends one `timing:run` event per run; this file turns those records into the
 * average time per step, the preset comparison and one rule-based tip.
 */
import type { AppConfig } from '../stores/appStore'
import { findActivePreset } from '../stores/appStore'

/** The speech guide in the repository, linked from the "speech is the slow part" tip. */
export const SPEECH_GUIDE_URL =
  'https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-recognition.md'

/** Event the backend sends after each Dictate, Translate or Ask run. */
export const RUN_TIMING_EVENT = 'timing:run'

export type RunMode = 'dictate' | 'translate' | 'ask'

/** One run as sent by the backend (`timing.rs`). Durations, sizes and presets only. */
export interface RunTiming {
  id: number
  mode: RunMode
  recordingSecs: number
  audioBytes: number
  finishRecordingMs: number
  speechMs: number
  /** null when AI did not run (polish off, AI not ready, or an Ask search). */
  aiMs: number | null
  /** null when nothing is pasted (an Ask answer window). */
  pasteMs: number | null
  totalMs: number
  speechPresetId: string
  speechModel: string
  aiPresetId: string
  aiModel: string
  language: string
  /** 'ok' or an error code. */
  outcome: string
}

export type StepId = 'recording' | 'speech' | 'ai' | 'paste'

export const STEP_IDS: StepId[] = ['recording', 'speech', 'ai', 'paste']

/**
 * The steps Insights shows (plan `home-refresh`). Finish recording is left out: it is a short,
 * fixed cost the user cannot tune.
 */
export const INSIGHT_STEPS: StepId[] = ['speech', 'ai', 'paste']

/** Step colour tokens (globals.css): recording grey, speech accent, AI violet, paste green. */
export const STEP_COLOR: Record<StepId, string> = {
  recording: 'var(--color-step-recording)',
  speech: 'var(--color-step-speech)',
  ai: 'var(--color-step-ai)',
  paste: 'var(--color-step-paste)',
}

/** A step's time in ms, or null when the step did not happen in that run. */
export function stepMs(run: RunTiming, step: StepId): number | null {
  switch (step) {
    case 'recording':
      return run.finishRecordingMs
    case 'speech':
      return run.speechMs
    case 'ai':
      return run.aiMs
    case 'paste':
      return run.pasteMs
  }
}

export function isOk(run: RunTiming): boolean {
  return run.outcome === 'ok'
}

/** Median of a list (mean of the two middle values for an even count); null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** The presets a run is compared against: the active speech and AI presets. */
export interface CurrentPresets {
  speechPresetId: string
  speechModel: string
  language: string
  aiPresetId: string
  aiModel: string
}

export function currentPresets(config: AppConfig): CurrentPresets {
  const speech = findActivePreset(config.speech_presets ?? [], config.active_speech_preset_id)
  const ai = findActivePreset(config.ai_presets ?? [], config.active_ai_preset_id)
  const language = speech?.language.trim() || 'auto'
  return {
    speechPresetId: speech?.id ?? '',
    speechModel: speech?.model ?? '',
    language,
    aiPresetId: ai?.id ?? '',
    aiModel: ai?.model ?? '',
  }
}

/** Arithmetic mean of a list; null when empty. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export interface AverageTimes {
  /** Mean per step over the finished runs that had that step; null when none had it. */
  steps: Record<StepId, number | null>
  /** Sum of the step averages shown in Insights, so the number matches the bar. */
  totalMs: number
  /** Finished runs the averages are taken over. */
  runCount: number
}

/**
 * Plan `home-refresh`: the average time per step over every finished run, whatever preset it
 * used. Failed runs are left out, and each step is averaged only over the runs where it ran (an
 * Ask answer has no paste, a run with polish off has no AI). Null when no run finished.
 */
export function averageTimes(runs: RunTiming[]): AverageTimes | null {
  const finished = runs.filter(isOk)
  if (finished.length === 0) return null
  const steps = {} as Record<StepId, number | null>
  for (const step of STEP_IDS) {
    steps[step] = mean(
      finished.map((run) => stepMs(run, step)).filter((ms): ms is number => ms !== null),
    )
  }
  const totalMs = INSIGHT_STEPS.reduce((sum, step) => sum + (steps[step] ?? 0), 0)
  return { steps, totalMs, runCount: finished.length }
}

export type TipId = 'speech' | 'ai' | 'paste'

/** Share of the total above which a step is called "the slow part". */
export const SPEECH_SLOW_SHARE = 0.6
export const AI_SLOW_SHARE = 0.5
/** Paste time above which pasting is called slow. */
export const PASTE_SLOW_MS = 300

/**
 * One tip from the largest step: speech over 60 % of the total, AI over 50 %, or paste over
 * 300 ms. Steps are checked from largest to smallest and the first rule that holds wins.
 * `outputMode` hides the paste tip when text is already typed directly.
 */
export function speedTip(
  steps: Record<StepId, number | null>,
  totalMs: number,
  outputMode: AppConfig['output_mode'],
): TipId | null {
  if (totalMs <= 0) return null
  const rules: Record<StepId, ((ms: number) => boolean) | null> = {
    recording: null,
    speech: (ms) => ms / totalMs > SPEECH_SLOW_SHARE,
    ai: (ms) => ms / totalMs > AI_SLOW_SHARE,
    paste: (ms) => ms > PASTE_SLOW_MS && outputMode !== 'keyboard',
  }
  const bySize = STEP_IDS.map((step) => ({ step, ms: steps[step] }))
    .filter((entry): entry is { step: StepId; ms: number } => entry.ms !== null)
    .sort((a, b) => b.ms - a.ms)
  for (const { step, ms } of bySize) {
    const rule = rules[step]
    if (rule && rule(ms)) return step as TipId
  }
  return null
}

/** "850 ms" below a second, "1.9 s" above. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** How many runs the backend keeps (`RUN_TIMING_CAPACITY` in `timing.rs`). */
export const RUN_CAPACITY = 200

/** Adds a run from an event, dropping one the list already has, keeping the last 200. */
export function addRun(runs: RunTiming[], run: RunTiming, capacity = RUN_CAPACITY): RunTiming[] {
  if (runs.some((existing) => existing.id === run.id)) return runs
  const next = [...runs, run]
  return next.length > capacity ? next.slice(next.length - capacity) : next
}

/** Plan `speed-by-preset`: a preset needs this many finished runs before it is ranked. */
export const MIN_RANKED_RUNS = 3

/**
 * Plan `speed-by-preset`: the mean after dropping the slowest runs, one per ten runs and at least
 * one once there are three. The timing records cannot tell whether a model was loaded during a
 * run (a server loads models out of our sight), so the slow first run after a load is removed
 * this way. Only the slow end is trimmed: a load makes a run slower, never faster.
 */
export function trimmedMean(values: number[]): number | null {
  if (values.length < MIN_RANKED_RUNS) return mean(values)
  const sorted = [...values].sort((a, b) => a - b)
  const drop = Math.max(1, Math.floor(sorted.length / 10))
  return mean(sorted.slice(0, sorted.length - drop))
}

/** One preset (and model) in the comparison. */
export interface PresetSpeed {
  presetId: string
  model: string
  runCount: number
  /**
   * Trimmed mean in ms (AI) or in ms per second of audio (speech); null until the preset has
   * `MIN_RANKED_RUNS` runs.
   */
  average: number | null
  /** The lowest average, when at least two presets are ranked. */
  fastest: boolean
}

/**
 * Groups values by preset id and model: ranked presets first, fastest first, then the ones that
 * have too few runs, most runs first.
 */
function rankPresets(entries: { presetId: string; model: string; value: number }[]): PresetSpeed[] {
  const groups = new Map<string, { presetId: string; model: string; values: number[] }>()
  for (const entry of entries) {
    if (!entry.presetId) continue
    const key = `${entry.presetId}\u0000${entry.model}`
    const group = groups.get(key) ?? { presetId: entry.presetId, model: entry.model, values: [] }
    group.values.push(entry.value)
    groups.set(key, group)
  }
  const speeds: PresetSpeed[] = [...groups.values()].map((group) => ({
    presetId: group.presetId,
    model: group.model,
    runCount: group.values.length,
    average: group.values.length >= MIN_RANKED_RUNS ? trimmedMean(group.values) : null,
    fastest: false,
  }))
  const ranked = speeds
    .filter((speed) => speed.average !== null)
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0))
  const unranked = speeds
    .filter((speed) => speed.average === null)
    .sort((a, b) => b.runCount - a.runCount)
  if (ranked.length >= 2) ranked[0].fastest = true
  return [...ranked, ...unranked]
}

/** AI presets by average AI time over the finished runs that used AI. */
export function aiPresetSpeeds(runs: RunTiming[]): PresetSpeed[] {
  return rankPresets(
    runs
      .filter((run) => isOk(run) && run.aiMs !== null)
      .map((run) => ({ presetId: run.aiPresetId, model: run.aiModel, value: run.aiMs ?? 0 })),
  )
}

/**
 * Speech presets by average recognition time per second of audio, so long and short recordings
 * compare fairly. Runs without audio length are left out.
 */
export function speechPresetSpeeds(runs: RunTiming[]): PresetSpeed[] {
  return rankPresets(
    runs
      .filter((run) => isOk(run) && run.recordingSecs > 0)
      .map((run) => ({
        presetId: run.speechPresetId,
        model: run.speechModel,
        value: run.speechMs / run.recordingSecs,
      })),
  )
}

/** "0.42 s": the comparison shows seconds with two decimals. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}
