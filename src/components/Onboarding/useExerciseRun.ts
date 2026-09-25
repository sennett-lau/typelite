import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import type { InsertResult, PipelineState, VoiceMode } from '../../stores/appStore'
import type { AskDictationResult } from '../../lib/tauri'
import { capsuleErrorKeyFromPayload } from '../../lib/capsuleError'
import type { PipelineErrorPayload } from '../../lib/capsuleError'

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

export interface ExerciseRun {
  /** Raw transcript of the current run ("You said"). */
  said: string
  /** Box text when the current run started. */
  before: string
  /** The Ask answer of the current run. */
  answer: string | null
  /** True once the run delivered its result (pasted, or the Ask answer arrived). */
  landed: boolean
  /** The last error, shown with Try again. */
  error: string | null
  /** Call when the practice box changes; an Ask answer typed at the cursor counts as landed. */
  noteBoxChange: (text: string) => void
}

/**
 * Follows one real shortcut run of `mode` for an exercise card, from backend events only:
 * - Dictate / Translate: starts at `pipeline:voice_mode` = `mode`, collects `stt:final`
 *   (the whole transcript so far), lands at a `pipeline:insert_result` that is not `failed`.
 *   The text itself arrives in the focused practice box by paste.
 * - Ask: starts at `pipeline:state` = `ask_recording`, collects `ask:final`, lands at
 *   `ask:result`, or when the box gets text after the question was sent.
 * Kept in memory only; the card unmounts (and forgets it) on Try again, Skip or a step change.
 */
export function useExerciseRun(
  mode: VoiceMode,
  boxText: () => string,
  onRunStarted: () => void,
): ExerciseRun {
  const { t } = useTranslation()
  const [said, setSaid] = useState('')
  const [before, setBefore] = useState(() => boxText())
  const [answer, setAnswer] = useState<string | null>(null)
  const [landed, setLanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runMode = useRef<VoiceMode | null>(null)
  const askSent = useRef(false)
  const latest = useRef({ t, boxText, onRunStarted })

  useEffect(() => {
    latest.current = { t, boxText, onRunStarted }
  })

  useEffect(() => {
    let disposed = false
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

    const startRun = () => {
      setSaid('')
      setAnswer(null)
      setLanded(false)
      setError(null)
      setBefore(latest.current.boxText())
      latest.current.onRunStarted()
    }

    add<PipelineErrorPayload>(EXERCISE_EVENTS.pipelineError, (payload) => {
      const key = capsuleErrorKeyFromPayload(payload)
      setError(latest.current.t(`capsule.errors.${key}`))
    })

    if (mode === 'ask') {
      add<PipelineState>(EXERCISE_EVENTS.pipelineState, (state) => {
        if (state === 'ask_recording') {
          askSent.current = false
          startRun()
        }
        if (state === 'ask_thinking') askSent.current = true
      })
      add<string>(EXERCISE_EVENTS.askFinal, (text) => setSaid(text.trim()))
      add<AskDictationResult>(EXERCISE_EVENTS.askResult, (result) => {
        setError(null)
        if (result.question?.trim()) setSaid(result.question.trim())
        setAnswer(result.answer ?? '')
        setLanded(true)
      })
      add<string>(EXERCISE_EVENTS.askError, (message) => setError(message))
    } else {
      add<VoiceMode | null>(EXERCISE_EVENTS.voiceMode, (value) => {
        // The backend sends the mode when recording starts and null when it goes idle again.
        if (!value) return
        runMode.current = value
        if (value === mode) startRun()
      })
      add<string>(EXERCISE_EVENTS.sttFinal, (text) => {
        if (runMode.current === mode) setSaid(text.trim())
      })
      add<InsertResult>(EXERCISE_EVENTS.insertResult, (result) => {
        if (runMode.current !== mode) return
        if (result.status === 'failed') {
          setError(result.message ?? latest.current.t('onboarding.practice.pasteFailed'))
          return
        }
        setLanded(true)
      })
    }

    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [mode])

  const noteBoxChange = useCallback(
    (text: string) => {
      if (mode === 'ask' && askSent.current && text.trim()) setLanded(true)
    },
    [mode],
  )

  return { said, before, answer, landed, error, noteBoxChange }
}
