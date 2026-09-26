import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import type { InsertResult, PipelineState, VoiceMode } from '../../stores/appStore'
import type { AskDictationResult } from '../../lib/tauri'
import { capsuleErrorKeyFromPayload } from '../../lib/capsuleError'
import type { PipelineErrorPayload } from '../../lib/capsuleError'
import type { RunStage } from './exerciseFlow'

/** Backend events an exercise listens to (all already used by the capsule / Ask panel). */
export const EXERCISE_EVENTS = {
  voiceMode: 'pipeline:voice_mode',
  sttFinal: 'stt:final',
  insertResult: 'pipeline:insert_result',
  pipelineState: 'pipeline:state',
  pipelineError: 'pipeline:error',
  askFinal: 'ask:final',
  askResult: 'ask:result',
  askError: 'ask:error',
} as const

/** Pipeline states after recording, while the result is being made. */
const WRITING_STATES: PipelineState[] = ['transcribing', 'polishing', 'outputting']

/**
 * A run that went idle while writing, without a result or an error, was cancelled; the page goes
 * back to Ready after this long (the insert result can arrive just after the idle state).
 */
export const CANCELLED_AFTER_MS = 1500

export interface ExerciseRun {
  stage: RunStage
  /** Raw transcript of the current run. */
  said: string
  /** Box text when the current run started. */
  before: string
  /** The Ask answer of the current run. */
  answer: string | null
  /**
   * How many characters the run inserted into the box, to wait for before deciding; null when
   * nothing is inserted (the Ask answer opens in its window).
   */
  expectedChars: number | null
  /** The last error, shown with Try again. */
  error: string | null
  /** The run had no speech ("Didn't catch that"). */
  noSpeech: boolean
}

const IDLE_RUN = {
  stage: 'idle' as RunStage,
  said: '',
  answer: null,
  expectedChars: null,
  error: null,
  noSpeech: false,
}

/**
 * Follows one real shortcut run of `mode` for an exercise page, from backend events only:
 * - Dictate / Translate: starts at `pipeline:voice_mode` = `mode`, collects `stt:final` (the whole
 *   transcript so far), writes from `transcribing`, lands at a `pipeline:insert_result` that is
 *   not `failed`. The text itself arrives in the focused box by paste.
 * - Ask: starts at `pipeline:state` = `ask_recording`, collects `ask:final`, writes from
 *   `ask_thinking`, lands at `ask:result`.
 * Kept in memory only; the page unmounts (and forgets it) on Try again, Skip or Next.
 */
export function useExerciseRun(mode: VoiceMode, boxText: () => string): ExerciseRun {
  const { t } = useTranslation()
  const [run, setRun] = useState<ExerciseRun>(() => ({ ...IDLE_RUN, before: boxText() }))
  const stage = useRef<RunStage>('idle')
  const latest = useRef({ t, boxText })

  useEffect(() => {
    latest.current = { t, boxText }
  })

  useEffect(() => {
    let disposed = false
    let cancelTimer: ReturnType<typeof setTimeout> | null = null
    const runMode = { current: null as VoiceMode | null }
    const unlisteners: Array<() => void> = []
    const add = <T>(event: string, handler: (payload: T) => void) => {
      listen<T>(event, (e) => {
        if (!disposed) handler(e.payload)
      })
        .then((unlisten) => {
          if (disposed) unlisten()
          else unlisteners.push(unlisten)
        })
        .catch((listenError) => console.error(`Failed to listen for ${event}:`, listenError))
    }

    const clearCancelTimer = () => {
      if (cancelTimer) clearTimeout(cancelTimer)
      cancelTimer = null
    }
    const update = (patch: Partial<ExerciseRun>) => {
      if (patch.stage) stage.current = patch.stage
      if (patch.stage && patch.stage !== 'writing') clearCancelTimer()
      setRun((previous) => ({ ...previous, ...patch }))
    }
    const startRun = () =>
      update({ ...IDLE_RUN, stage: 'listening', before: latest.current.boxText() })
    const startWriting = () => {
      if (stage.current === 'listening') update({ stage: 'writing' })
    }
    // Recording cancelled (Esc) or a run that ended without anything: back to Ready.
    const wentIdle = () => {
      if (stage.current === 'listening') {
        update({ stage: 'idle' })
      } else if (stage.current === 'writing' && !cancelTimer) {
        cancelTimer = setTimeout(() => {
          cancelTimer = null
          if (stage.current === 'writing') update({ stage: 'idle' })
        }, CANCELLED_AFTER_MS)
      }
    }

    add<PipelineErrorPayload>(EXERCISE_EVENTS.pipelineError, (payload) => {
      const key = capsuleErrorKeyFromPayload(payload)
      if (key === 'stt_no_speech_detected') {
        update({ stage: 'idle', noSpeech: true, error: null })
      } else {
        update({ stage: 'idle', error: latest.current.t(`capsule.errors.${key}`) })
      }
    })

    if (mode === 'ask') {
      add<PipelineState>(EXERCISE_EVENTS.pipelineState, (state) => {
        if (state === 'ask_recording') startRun()
        else if (state === 'ask_thinking') startWriting()
        else if (state === 'idle') wentIdle()
      })
      add<string>(EXERCISE_EVENTS.askFinal, (text) => update({ said: text.trim() }))
      add<AskDictationResult>(EXERCISE_EVENTS.askResult, (result) => {
        update({
          stage: 'landed',
          error: null,
          answer: result.answer ?? '',
          // Ask replaced the selection: wait for the new text to reach the box.
          expectedChars: result.output === 'insertedText' ? 1 : null,
          ...(result.question?.trim() ? { said: result.question.trim() } : {}),
        })
      })
      add<string>(EXERCISE_EVENTS.askError, (message) => update({ stage: 'idle', error: message }))
    } else {
      add<VoiceMode | null>(EXERCISE_EVENTS.voiceMode, (value) => {
        // The backend sends the mode when recording starts and null when it goes idle again.
        if (!value) return
        runMode.current = value
        if (value === mode) startRun()
      })
      add<PipelineState>(EXERCISE_EVENTS.pipelineState, (state) => {
        if (runMode.current !== mode) return
        if (WRITING_STATES.includes(state)) startWriting()
        else if (state === 'idle') wentIdle()
      })
      add<string>(EXERCISE_EVENTS.sttFinal, (text) => {
        if (runMode.current === mode) update({ said: text.trim() })
      })
      add<InsertResult>(EXERCISE_EVENTS.insertResult, (result) => {
        if (runMode.current !== mode) return
        const { t: translate } = latest.current
        if (result.status === 'failed') {
          update({
            stage: 'idle',
            error: result.message ?? translate('onboarding.practice.pasteFailed'),
          })
        } else if (result.status === 'heldForCopy' || result.status === 'copiedFallback') {
          update({ stage: 'idle', error: translate('onboarding.practice.notPasted') })
        } else {
          update({ stage: 'landed', expectedChars: result.charsInserted ?? 0 })
        }
      })
    }

    return () => {
      disposed = true
      clearCancelTimer()
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [mode])

  return run
}
