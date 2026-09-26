import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTauriEvents } from '../useTauriEvents'
import { useAppStore } from '../../stores/appStore'
import { toast } from '../../components/toast-service'

const eventListeners = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>())

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    eventListeners.set(event, handler)
    return Promise.resolve(vi.fn())
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../i18n', () => ({
  default: {
    language: 'en',
    changeLanguage: vi.fn(),
  },
}))

vi.mock('../../lib/tauri', () => ({
  ASK_SELECTION_PREVIEW_EVENT: 'ask:selection_preview',
}))

vi.mock('../../components/toast-service', () => ({
  toast: vi.fn(),
}))

function HookHarness() {
  useTauriEvents()
  return null
}

describe('useTauriEvents', () => {
  beforeEach(() => {
    eventListeners.clear()
    useAppStore.setState({
      hotkeyRegistrationError: null,
      lastContext: null,
      activeVoiceMode: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('clears hotkey registration errors when the backend reports recovery', async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('hotkey:registration-failed')).toBe(true)
    })

    act(() => {
      eventListeners.get('hotkey:registration-failed')?.({ payload: 'Shortcut occupied' })
    })
    expect(useAppStore.getState().hotkeyRegistrationError).toBe('Shortcut occupied')

    await waitFor(() => {
      expect(eventListeners.has('hotkey:registration-recovered')).toBe(true)
    })

    act(() => {
      eventListeners.get('hotkey:registration-recovered')?.({ payload: undefined })
    })
    expect(useAppStore.getState().hotkeyRegistrationError).toBeNull()
  })

  it('applies language settings saved by an automatic preset update', async () => {
    const base = useAppStore.getState().config
    const unsaved = { ...base.translation, targets: ['en', 'ja'] }
    useAppStore.setState({ config: { ...base, translation: unsaved }, savedConfig: base })
    render(<HookHarness />)
    await waitFor(() => expect(eventListeners.has('language-library:changed')).toBe(true))

    const languages = {
      'zh-Hant-HK': {
        instructions: null,
        library_preset: { id: 'cantonese-hong-kong', version: 3, sha256: 'b'.repeat(64) },
        auto_update: true,
      },
    }
    act(() => {
      eventListeners.get('language-library:changed')?.({ payload: { languages } })
    })
    const state = useAppStore.getState()
    expect(state.config.translation.languages).toEqual(languages)
    expect(state.savedConfig?.translation.languages).toEqual(languages)
    // Unsaved list edits stay.
    expect(state.config.translation.targets).toEqual(['en', 'ja'])

    // A plain cache change carries no languages and changes nothing.
    act(() => {
      eventListeners.get('language-library:changed')?.({ payload: { languages: null } })
    })
    expect(useAppStore.getState().config.translation.languages).toEqual(languages)
  })

  it('shows a setup message with its Settings pane and leaves the status dots alone', async () => {
    useAppStore.setState({ speechHealth: null })
    render(<HookHarness />)
    await waitFor(() => expect(eventListeners.has('pipeline:error')).toBe(true))

    act(() => {
      eventListeners.get('pipeline:error')?.({
        payload: { code: 'speech_not_ready', details: 'stt', retry_count: 0 },
      })
    })

    expect(useAppStore.getState().pipelineError).toBe('capsule.errors.speech_not_ready')
    expect(useAppStore.getState().pipelineErrorAction).toBe('stt')
    expect(useAppStore.getState().speechHealth).toBeNull()
  })

  it('mirrors preset test results saved by the backend', async () => {
    render(<HookHarness />)
    await waitFor(() => expect(eventListeners.has('preset:verification')).toBe(true))
    const id = useAppStore.getState().config.speech_presets[0].id

    act(() => {
      eventListeners.get('preset:verification')?.({
        payload: { kind: 'speech', presetId: id, verifiedAt: 99 },
      })
    })

    expect(useAppStore.getState().config.speech_presets[0].verified_at).toBe(99)
  })

  it('clears stale capsule errors when a new pipeline run starts preparing', async () => {
    useAppStore.setState({ pipelineError: 'Previous failure' })
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('pipeline:state')).toBe(true)
    })

    act(() => {
      eventListeners.get('pipeline:state')?.({ payload: 'preparing' })
    })

    expect(useAppStore.getState().pipelineError).toBeNull()
  })

  it('stores only the safe context summary emitted for the completed operation', async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('pipeline:context')).toBe(true)
    })

    act(() => {
      eventListeners.get('pipeline:context')?.({
        payload: {
          profileId: 'chat.slack',
          family: 'work_chat',
          appLabel: 'Slack',
          iconKey: 'slack',
          overrideId: 'slack',
        },
      })
    })

    expect(useAppStore.getState().lastContext).toEqual({
      profileId: 'chat.slack',
      family: 'work_chat',
      appLabel: 'Slack',
      iconKey: 'slack',
      overrideId: 'slack',
    })
  })

  it('tracks the operation voice mode without inferring it from pipeline state', async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('pipeline:voice_mode')).toBe(true)
    })

    act(() => {
      eventListeners.get('pipeline:voice_mode')?.({ payload: 'translate' })
    })
    expect(useAppStore.getState().activeVoiceMode).toBe('translate')

    act(() => {
      eventListeners.get('pipeline:voice_mode')?.({ payload: null })
    })
    expect(useAppStore.getState().activeVoiceMode).toBeNull()
  })

  it('keeps the highlight preview for the Ask pill until a dictation starts', async () => {
    // Plan `ask-panel-above-pill`: the "About …" chip.
    useAppStore.setState({ askSelectionPreview: null })
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('ask:selection_preview')).toBe(true)
    })

    act(() => {
      eventListeners.get('ask:selection_preview')?.({ payload: 'idempotent, so ret…' })
      eventListeners.get('pipeline:state')?.({ payload: 'ask_recording' })
    })
    expect(useAppStore.getState().askSelectionPreview).toBe('idempotent, so ret…')

    // Thinking and the done flash keep it (the flash says "Replaced").
    act(() => {
      eventListeners.get('pipeline:state')?.({ payload: 'ask_thinking' })
      eventListeners.get('pipeline:state')?.({ payload: 'idle' })
    })
    expect(useAppStore.getState().askSelectionPreview).toBe('idempotent, so ret…')

    act(() => {
      eventListeners.get('pipeline:state')?.({ payload: 'preparing' })
    })
    expect(useAppStore.getState().askSelectionPreview).toBeNull()

    act(() => {
      eventListeners.get('ask:selection_preview')?.({ payload: 'x' })
      eventListeners.get('ask:selection_preview')?.({ payload: null })
    })
    expect(useAppStore.getState().askSelectionPreview).toBeNull()
  })

  it('shows deadline warnings and explains an automatic graceful stop', async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('recording:deadline-warning')).toBe(true)
      expect(eventListeners.has('recording:deadline-reached')).toBe(true)
    })

    const base = {
      sessionId: 7,
      recordingKind: 'dictation',
      effectiveMaxSeconds: 600,
      providerId: 'builtin-speech-local',
      explanationKey: 'recordingLimits.reasons.clientBuffer',
    }
    act(() => {
      eventListeners.get('recording:deadline-warning')?.({
        payload: { ...base, secondsRemaining: 10 },
      })
      eventListeners.get('recording:deadline-reached')?.({ payload: base })
    })

    expect(toast).toHaveBeenNthCalledWith(1, 'recordingLimits.deadlineWarning', 'info')
    expect(toast).toHaveBeenNthCalledWith(2, 'recordingLimits.deadlineReached', 'info')
  })

  it('tracks speech and AI health from dictation runs for the sidebar status', async () => {
    useAppStore.setState({ speechHealth: null, aiHealth: null })
    render(<HookHarness />)

    await waitFor(() => {
      expect(eventListeners.has('pipeline:insert_result')).toBe(true)
    })

    const emit = (event: string, payload: unknown) =>
      act(() => {
        eventListeners.get(event)?.({ payload })
      })

    // A run that polished and inserted text: both endpoints worked.
    emit('pipeline:state', 'recording')
    emit('pipeline:state', 'transcribing')
    emit('pipeline:state', 'polishing')
    emit('pipeline:insert_result', { method: 'clipboard' })
    expect(useAppStore.getState().speechHealth?.ok).toBe(true)
    expect(useAppStore.getState().aiHealth?.ok).toBe(true)

    // A run where the AI failed: speech stays green, AI turns red, even after the raw insert.
    emit('pipeline:state', 'recording')
    emit('pipeline:state', 'polishing')
    emit('pipeline:error', { code: 'llm_failed' })
    emit('pipeline:insert_result', { method: 'clipboard' })
    expect(useAppStore.getState().speechHealth?.ok).toBe(true)
    expect(useAppStore.getState().aiHealth?.ok).toBe(false)

    // A speech server failure.
    emit('pipeline:state', 'recording')
    emit('pipeline:error', { code: 'stt_connection_failed' })
    expect(useAppStore.getState().speechHealth?.ok).toBe(false)
  })
})
