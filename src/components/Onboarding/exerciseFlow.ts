/**
 * Plan 0013: the order of a step's exercises and what happened to each. Pure, so the flow
 * (success, miss, try again, skip) is tested without the UI.
 */

export type ExerciseStatus = 'pending' | 'done' | 'skipped'

/**
 * `ready`: waiting for a run. `running`: a run started. `success` / `miss`: the last run's
 * check passed or did not.
 */
export type ExercisePhase = 'ready' | 'running' | 'success' | 'miss'

export interface ExerciseFlowState {
  /** The current exercise; equal to `statuses.length` once every exercise is finished. */
  index: number
  statuses: ExerciseStatus[]
  phase: ExercisePhase
  /** Grows on every Try again, so the card (box, before/after) starts fresh. */
  attempt: number
}

export type ExerciseFlowAction =
  | { type: 'runStarted' }
  | { type: 'result'; passed: boolean }
  | { type: 'retry' }
  | { type: 'skip' }
  | { type: 'next' }
  | { type: 'restart' }

export function initialExerciseFlow(count: number): ExerciseFlowState {
  return { index: 0, statuses: Array(count).fill('pending'), phase: 'ready', attempt: 0 }
}

/** True once every exercise is done or skipped. */
export function flowComplete(state: ExerciseFlowState): boolean {
  return state.statuses.every((status) => status !== 'pending')
}

/** True when every exercise has been passed through (the summary shows). */
export function flowFinished(state: ExerciseFlowState): boolean {
  return state.index >= state.statuses.length
}

function withStatus(
  statuses: ExerciseStatus[],
  index: number,
  status: ExerciseStatus,
): ExerciseStatus[] {
  return statuses.map((value, i) => (i === index ? status : value))
}

export function exerciseFlowReducer(
  state: ExerciseFlowState,
  action: ExerciseFlowAction,
): ExerciseFlowState {
  if (flowFinished(state) && action.type !== 'restart') return state
  switch (action.type) {
    case 'runStarted':
      // A new run clears a miss; a success stays visible.
      return state.phase === 'success' ? state : { ...state, phase: 'running' }
    case 'result':
      if (state.phase === 'success') return state
      if (!action.passed) return { ...state, phase: 'miss' }
      return {
        ...state,
        phase: 'success',
        statuses: withStatus(state.statuses, state.index, 'done'),
      }
    case 'retry':
      // Resets this exercise's card; an exercise already passed stays done.
      return { ...state, phase: 'ready', attempt: state.attempt + 1 }
    case 'skip': {
      const current = state.statuses[state.index]
      return {
        ...state,
        index: state.index + 1,
        statuses: withStatus(state.statuses, state.index, current === 'done' ? 'done' : 'skipped'),
        phase: 'ready',
        attempt: state.attempt + 1,
      }
    }
    case 'next':
      if (state.statuses[state.index] !== 'done') return state
      return { ...state, index: state.index + 1, phase: 'ready', attempt: state.attempt + 1 }
    case 'restart':
      // Practise again: back to the first card; what was already done stays done.
      return { ...state, index: 0, phase: 'ready', attempt: state.attempt + 1 }
  }
}
