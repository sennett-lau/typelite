import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../stores/appStore'
import {
  activeAiPreset,
  activeSpeechPreset,
  endpointForError,
  endpointState,
  recordAiResult,
  recordSpeechResult,
} from '../connectionStatus'

describe('connection status', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
  })

  it('is unknown until a result exists for the active preset', () => {
    expect(endpointState(null, 'a')).toBe('unknown')
    expect(endpointState({ presetId: 'b', ok: true }, 'a')).toBe('unknown')
    expect(endpointState({ presetId: 'a', ok: true }, 'a')).toBe('ok')
    expect(endpointState({ presetId: 'a', ok: false }, 'a')).toBe('error')
  })

  it('maps pipeline errors to the endpoint they point at', () => {
    expect(endpointForError('stt_connection_failed')).toBe('speech')
    expect(endpointForError('stt_timeout')).toBe('speech')
    expect(endpointForError('llm_failed')).toBe('ai')
    expect(endpointForError('stt_no_speech_detected')).toBeNull()
    expect(endpointForError('accessibility_required')).toBeNull()
  })

  it('records results against the active presets', () => {
    const { config } = useAppStore.getState()
    recordSpeechResult(true)
    recordAiResult(false)
    const state = useAppStore.getState()
    expect(state.speechHealth).toEqual({ presetId: activeSpeechPreset(config).id, ok: true })
    expect(state.aiHealth).toEqual({ presetId: activeAiPreset(config).id, ok: false })
  })
})
