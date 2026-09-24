import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import type { InsertResult, PipelineState, VoiceMode } from '../../stores/appStore'
import type { AskDictationResult } from '../../lib/tauri'
import { capsuleErrorKeyFromPayload } from '../../lib/capsuleError'
import type { PipelineErrorPayload } from '../../lib/capsuleError'

/** Backend events the practice steps listen to (all already used by the capsule / Ask panel). */
export const PRACTICE_EVENTS = {
  voiceMode: 'pipeline:voice_mode',
  insertResult: 'pipeline:insert_result',
  pipelineState: 'pipeline:state',
  pipelineError: 'pipeline:error',
  askResult: 'ask:result',
  askError: 'ask:error',
} as const

export interface PracticeCompletion {
  /** The last error from a practice run, shown with "try again". */
  error: string | null
  /** The Ask answer, when the Ask practice produced one. */
  answer: string | null
  /** Call when the practice text box changes; covers an Ask answer typed into the box. */
  notePracticeText: (text: string) => void
}

/**
 * Watches the backend events of a real shortcut run and calls `onComplete` once one run of
 * `mode` worked:
 * - Dictate / Translate: a `pipeline:insert_result` that is not `failed`, in a run whose
 *   `pipeline:voice_mode` was `mode`. The text itself lands in the focused practice box.
 * - Ask: an `ask:result` (the answer window opened), or the practice box receiving text after
 *   an Ask run (when the answer was typed at the cursor instead).
 */
export function usePracticeCompletion(mode: VoiceMode, onComplete: () => void): PracticeCompletion {
  const { t } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<string | null>(null)
  const runMode = useRef<VoiceMode | null>(null)
  const askRunFinished = useRef(false)
  const latest = useRef({ onComplete, t })

  useEffect(() => {
    latest.current = { onComplete, t }
  })

  useEffect(() => {
    let disposed = false
    const unlisteners: Array<() => void> = []
    const add = <T>(event: string, handler: (payload: T) => void) => {
      listen<T>(event, (e) => handler(e.payload))
        .then((unlisten) => {
          if (disposed) unlisten()
          else unlisteners.push(unlisten)
        })
        .catch((listenError) => console.error(`Failed to listen for ${event}:`, listenError))
    }

    add<VoiceMode | null>(PRACTICE_EVENTS.voiceMode, (value) => {
      // The backend sends the mode when recording starts and null when it goes idle again.
      if (value) runMode.current = value
    })
    add<PipelineState>(PRACTICE_EVENTS.pipelineState, (state) => {
      if (state === 'recording' || state === 'ask_recording') setError(null)
      if (state === 'ask_recording') askRunFinished.current = false
      if (state === 'ask_thinking') askRunFinished.current = true
    })
    add<InsertResult>(PRACTICE_EVENTS.insertResult, (result) => {
      if (mode === 'ask' || runMode.current !== mode) return
      if (result.status === 'failed') {
        setError(result.message ?? latest.current.t('onboarding.practice.pasteFailed'))
        return
      }
      latest.current.onComplete()
    })
    add<PipelineErrorPayload>(PRACTICE_EVENTS.pipelineError, (payload) => {
      const key = capsuleErrorKeyFromPayload(payload)
      setError(latest.current.t(`capsule.errors.${key}`))
    })
    if (mode === 'ask') {
      add<AskDictationResult>(PRACTICE_EVENTS.askResult, (result) => {
        setError(null)
        setAnswer(result.answer)
        latest.current.onComplete()
      })
      add<string>(PRACTICE_EVENTS.askError, (message) => setError(message))
    }

    return () => {
      disposed = true
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [mode])

  const notePracticeText = useCallback(
    (text: string) => {
      if (mode === 'ask' && askRunFinished.current && text.trim()) latest.current.onComplete()
    },
    [mode],
  )

  return { error, answer, notePracticeText }
}
