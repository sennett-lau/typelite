import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { useAppStore } from '../stores/appStore'
import type {
  AppConfig,
  ContextProfileSummary,
  InsertResult,
  PipelineState,
  RecordingDeadlineSnapshot,
  VoiceMode,
} from '../stores/appStore'
import { toast } from '../components/toast-service'
import {
  capsuleErrorKeyFromPayload,
  setupPaneForError,
  type PipelineErrorPayload,
} from '../lib/capsuleError'
import { applyVerificationEvent, type PresetVerificationEvent } from '../lib/readiness'
import { endpointForError, recordAiResult, recordSpeechResult } from '../lib/connectionStatus'
import { useSpeechSetupStore } from '../stores/speechSetupStore'
import type { SpeechSetupStatus } from '../lib/tauri'

type Unlisten = () => void | Promise<void>

interface RecordingDeadlineNotice {
  sessionId: number
  recordingKind: 'dictation' | 'ask'
  secondsRemaining?: number
  effectiveMaxSeconds: number
  providerId: string
  explanationKey: string
}

function formatDeadlineDuration(seconds: number, t: ReturnType<typeof useTranslation>['t']) {
  if (seconds === 60) return t('recordingLimits.durationMinute', { count: 1 })
  if (seconds > 0 && seconds % 60 === 0) {
    return t('recordingLimits.durationMinutes', { count: seconds / 60 })
  }
  return t('recordingLimits.durationSeconds', { count: seconds })
}

function safeUnlisten(unlisten: Unlisten) {
  try {
    Promise.resolve(unlisten()).catch(() => {})
  } catch {
    // Dev HMR can leave Tauri listener handles stale.
  }
}

export function useTauriEvents() {
  const { t } = useTranslation()
  const {
    setAudioVolume,
    setPartialTranscript,
    setFinalTranscript,
    appendPolishedChunk,
    setPipelineState,
    setRecordingDeadline,
    setActiveVoiceMode,
    setTargetApp,
    setLastInsertResult,
    setLastContext,
    setPipelineError,
    setAccessibilityTrusted,
    applyPersistedConfigPatch,
    setHotkeyRegistrationError,
  } = useAppStore()
  // Sidebar connection status for the current dictation run: the AI counts as working only
  // when the run reached "polishing" and then inserted text without an AI error. A ref, so a
  // re-registration of the listeners in the middle of a run keeps what the run has seen.
  const currentRun = useRef({ polished: false, aiFailed: false })

  useEffect(() => {
    let cancelled = false
    const unlisteners: Unlisten[] = []
    const run = currentRun.current

    function addListener<T>(event: string, handler: (payload: T) => void) {
      listen<T>(event, (e) => handler(e.payload))
        .then((unlisten) => {
          if (cancelled) {
            safeUnlisten(unlisten)
          } else {
            unlisteners.push(unlisten)
          }
        })
        .catch((err) => {
          console.error(`Failed to register listener for "${event}":`, err)
        })
    }

    addListener<number>('audio:volume', setAudioVolume)
    addListener<string>('stt:partial', setPartialTranscript)
    addListener<string>('stt:final', setFinalTranscript)
    addListener<string>('llm:chunk', appendPolishedChunk)
    addListener<PipelineState>('pipeline:state', (state) => {
      setPipelineState(state)
      if (state === 'preparing' || state === 'idle') {
        setRecordingDeadline(null)
      }
      if (state === 'preparing' || state === 'recording' || state === 'ask_recording') {
        // Clear any previous error when starting a new pipeline run
        setPipelineError(null)
        run.polished = false
        run.aiFailed = false
      }
      if (state === 'polishing') {
        // Polishing starts only after the speech server returned a transcript.
        recordSpeechResult(true)
        run.polished = true
      }
      // Don't clear pipelineError on 'idle' — CapsuleError auto-resets after 2.5s.
      // Clearing there would swallow errors from failed start() calls that
      // transition Recording → Idle in rapid succession.
    })
    addListener<RecordingDeadlineSnapshot>('recording:deadline', setRecordingDeadline)
    addListener<RecordingDeadlineNotice>('recording:deadline-warning', (payload) => {
      toast(
        t('recordingLimits.deadlineWarning', {
          seconds: payload.secondsRemaining ?? 10,
        }),
        'info',
      )
    })
    addListener<RecordingDeadlineNotice>('recording:deadline-reached', (payload) => {
      toast(
        t('recordingLimits.deadlineReached', {
          duration: formatDeadlineDuration(payload.effectiveMaxSeconds, t),
          reason: t(payload.explanationKey),
        }),
        'info',
      )
    })
    addListener<VoiceMode | null>('pipeline:voice_mode', setActiveVoiceMode)
    addListener<string>('pipeline:target_app', setTargetApp)
    addListener<InsertResult>('pipeline:insert_result', (result) => {
      setLastInsertResult(result)
      recordSpeechResult(true)
      if (run.polished && !run.aiFailed) recordAiResult(true)
    })
    addListener<ContextProfileSummary>('pipeline:context', setLastContext)
    addListener<PipelineErrorPayload>('pipeline:error', (payload) => {
      const capsuleErrorKey = capsuleErrorKeyFromPayload(payload)
      setPipelineError(t(`capsule.errors.${capsuleErrorKey}`), setupPaneForError(capsuleErrorKey))
      const endpoint = endpointForError(capsuleErrorKey)
      if (endpoint === 'speech') recordSpeechResult(false)
      if (endpoint === 'ai') {
        run.aiFailed = true
        recordAiResult(false)
      }
      if (capsuleErrorKey === 'accessibility_required') {
        setAccessibilityTrusted(false)
      }
    })
    addListener<{ code: string; details?: string }>('pipeline:warning', (payload) => {
      const message = t(`errors.${payload.code}`, { details: payload.details ?? '' })
      toast(message, 'info')
    })
    addListener<string>('hotkey:registration-failed', (payload) => {
      setHotkeyRegistrationError(payload)
    })
    addListener<void>('hotkey:registration-recovered', () => {
      setHotkeyRegistrationError(null)
    })
    addListener<Partial<AppConfig>>('config:patch', (patch) => {
      applyPersistedConfigPatch(patch)
      if (patch.ui_language) {
        i18n.changeLanguage(patch.ui_language)
        localStorage.setItem('ui_language', patch.ui_language)
      }
    })

    addListener<PresetVerificationEvent>('preset:verification', applyVerificationEvent)
    // Plan `quick-speech-setup`: Quick speech setup progress, kept in a store so it survives
    // leaving the step.
    addListener<SpeechSetupStatus>('speech-setup:status', (status) =>
      useSpeechSetupStore.getState().applyStatus(status),
    )

    addListener<void>('tray:settings', () => {
      window.location.hash = '#/settings'
    })
    addListener<string>('navigate', (hash) => {
      window.location.hash = hash
    })
    addListener<void>('tray:about', () => {
      window.location.hash = '#/about'
    })

    return () => {
      cancelled = true
      unlisteners.forEach(safeUnlisten)
    }
  }, [
    setAudioVolume,
    setPartialTranscript,
    setFinalTranscript,
    appendPolishedChunk,
    setPipelineState,
    setRecordingDeadline,
    setActiveVoiceMode,
    setTargetApp,
    setLastInsertResult,
    setLastContext,
    setPipelineError,
    setAccessibilityTrusted,
    applyPersistedConfigPatch,
    setHotkeyRegistrationError,
    t,
  ])
}
