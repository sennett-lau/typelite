/**
 * Plan `tutorial-one-page`: what an exercise page shows, and when its result is decided. Pure, so
 * the states are tested without the UI.
 */

/** What happened to an exercise: kept by the onboarding so Back and Next remember it. */
export type ExerciseStatus = 'pending' | 'done' | 'skipped'

/**
 * Where the current run is. `idle`: no run yet (or it was cancelled). `listening`: recording.
 * `writing`: recording stopped, the result is on its way. `landed`: the pipeline delivered it.
 */
export type RunStage = 'idle' | 'listening' | 'writing' | 'landed'

/** The page's state, one per result line. */
export type ExerciseView =
  | 'ready'
  | 'listening'
  | 'writing'
  | 'success'
  | 'miss'
  | 'noSpeech'
  | 'error'

/** The check's answer for a landed run, or null while it is not decided yet. */
export type Verdict = 'success' | 'miss' | null

/**
 * How long the box must stay unchanged once all inserted characters arrived, before the result
 * is decided.
 */
export const SETTLE_MS = 150

/**
 * How long the box must stay unchanged when the inserted characters never all arrive (the paste
 * was held for Copy, or the text differs from the count), before the result is decided.
 */
export const MISS_DELAY_MS = 600

export interface ViewInput {
  stage: RunStage
  verdict: Verdict
  error: string | null
  noSpeech: boolean
}

/** The state to show. A success wins; then errors; then the run's own stage. */
export function exerciseView({ stage, verdict, error, noSpeech }: ViewInput): ExerciseView {
  if (verdict === 'success') return 'success'
  if (noSpeech) return 'noSpeech'
  if (error) return 'error'
  if (verdict === 'miss') return 'miss'
  if (stage === 'listening') return 'listening'
  if (stage === 'writing' || stage === 'landed') return 'writing'
  return 'ready'
}

/**
 * How long to wait, after the last change of the box, before deciding a landed run.
 * `expected`: characters the pipeline says it inserted (null: nothing to wait for).
 * `arrived`: characters that reached the box so far.
 */
export function decideDelay(expected: number | null, arrived: number): number {
  if (expected === null) return 0
  return arrived >= expected ? SETTLE_MS : MISS_DELAY_MS
}

/** The status after Skip: an exercise already passed stays done. */
export function skippedStatus(current: ExerciseStatus | undefined): ExerciseStatus {
  return current === 'done' ? 'done' : 'skipped'
}
