import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../stores/appStore'
import {
  applyVerificationEvent,
  clearTestResult,
  hasPlaceholder,
  isAiReady,
  isSpeechReady,
  recordTestPassed,
} from '../readiness'

function state() {
  return useAppStore.getState()
}

function speech(configKey: 'config' | 'savedConfig' = 'config') {
  return state()[configKey]?.speech_presets[0]
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useAppStore.setState({ savedConfig: state().config })
})

describe('service readiness', () => {
  it('is not ready until the active preset passed a test', () => {
    expect(isSpeechReady(state().config)).toBe(false)
    expect(isAiReady(state().config)).toBe(false)

    recordTestPassed('speech', speech()!)
    expect(isSpeechReady(state().config)).toBe(true)
    expect(isAiReady(state().config)).toBe(false)
  })

  it('follows the active preset', () => {
    recordTestPassed('speech', speech()!)
    state().updateConfig({
      speech_presets: [
        ...state().config.speech_presets,
        {
          id: 'mine',
          name: 'Mine',
          kind: 'openai_compatible',
          base_url: 'https://api.openai.com/v1',
          model: 'whisper-1',
          language: 'auto',
          builtin: false,
          verified_at: null,
        },
      ],
      active_speech_preset_id: 'mine',
    })
    expect(isSpeechReady(state().config)).toBe(false)
  })

  it('records a pass in the saved config too, so Settings does not show it as unsaved', () => {
    recordTestPassed('speech', speech()!)
    expect(speech('savedConfig')?.verified_at).toEqual(speech()?.verified_at)
  })

  it('does not record a pass for a connection the saved config does not have', () => {
    state().updateConfig({
      speech_presets: state().config.speech_presets.map((preset, index) =>
        index === 0 ? { ...preset, model: 'small' } : preset,
      ),
    })
    recordTestPassed('speech', speech()!)

    expect(speech()?.verified_at).toEqual(expect.any(Number))
    expect(speech('savedConfig')?.verified_at).toBeNull()
  })

  it('never records a pass for a placeholder URL', () => {
    const lan = state().config.ai_presets[1]
    expect(hasPlaceholder(lan.base_url)).toBe(true)
    recordTestPassed('ai', lan)
    expect(state().config.ai_presets[1].verified_at).toBeNull()
  })

  it('clears a result in both configs', () => {
    recordTestPassed('speech', speech()!)
    clearTestResult('speech', speech()!.id)
    expect(speech()?.verified_at).toBeNull()
    expect(speech('savedConfig')?.verified_at).toBeNull()
  })

  it('mirrors backend results, but not onto a preset that is being edited', () => {
    applyVerificationEvent({ kind: 'ai', presetId: 'builtin-ai-ollama-local', verifiedAt: 42 })
    expect(state().config.ai_presets[0].verified_at).toBe(42)
    expect(state().savedConfig?.ai_presets[0].verified_at).toBe(42)

    applyVerificationEvent({ kind: 'ai', presetId: 'builtin-ai-ollama-local', verifiedAt: null })
    expect(state().config.ai_presets[0].verified_at).toBeNull()

    state().updateConfig({
      ai_presets: state().config.ai_presets.map((preset, index) =>
        index === 0 ? { ...preset, model: 'edited' } : preset,
      ),
    })
    applyVerificationEvent({ kind: 'ai', presetId: 'builtin-ai-ollama-local', verifiedAt: 50 })
    expect(state().config.ai_presets[0].verified_at).toBeNull()
    expect(state().savedConfig?.ai_presets[0].verified_at).toBe(50)
  })
})

describe('hasPlaceholder', () => {
  it('spots template placeholders only', () => {
    expect(hasPlaceholder('http://<computer-ip>:8000/v1')).toBe(true)
    expect(hasPlaceholder('http://127.0.0.1:8000/v1')).toBe(false)
  })
})
