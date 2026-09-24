import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SttSetupStep } from '../SttSetupStep'
import * as tauri from '../../../lib/tauri'
import { useAppStore, type SpeechPreset } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const pcPreset: SpeechPreset = {
  id: 'pc-speaches',
  name: 'PC Speaches',
  base_url: 'http://100.90.208.26:8000/v1',
  model: 'Systran/faster-whisper-large-v3',
  language: 'auto',
  builtin: false,
}

function config() {
  return useAppStore.getState().config
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('SttSetupStep', () => {
  it('preselects the built-in preset and shows its endpoint and model', () => {
    render(<SttSetupStep />)

    expect(screen.getByLabelText('Speech Recognition Service')).toHaveValue('builtin-whisper-local')
    expect(screen.getByText('http://127.0.0.1:8178/v1')).toBeInTheDocument()
    expect(screen.getByText('large-v3-turbo')).toBeInTheDocument()
    expect(screen.getByLabelText('API key (optional)')).toHaveValue('')
  })

  it('marks the step passed with the latency after a successful test', async () => {
    vi.mocked(tauri.testSpeechPreset).mockResolvedValue(2100)
    render(<SttSetupStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText(/2100 ms/)).toBeInTheDocument()
    expect(tauri.testSpeechPreset).toHaveBeenCalledWith(config().speech_presets[0], '')
    expect(useAppStore.getState().sttTestStatus).toBe('success')
  })

  it('keeps the step blocked and shows why when the test fails', async () => {
    vi.mocked(tauri.testSpeechPreset).mockRejectedValue('connection refused')
    render(<SttSetupStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('Connection failed: connection refused')).toBeInTheDocument()
    expect(useAppStore.getState().sttTestStatus).toBe('error')
  })

  it('switching presets activates it and requires a new test', async () => {
    useAppStore.getState().updateConfig({
      speech_presets: [...config().speech_presets, pcPreset],
    })
    useAppStore.getState().setSttTestStatus('success')
    render(<SttSetupStep />)

    fireEvent.change(screen.getByLabelText('Speech Recognition Service'), {
      target: { value: 'pc-speaches' },
    })

    expect(config().active_speech_preset_id).toBe('pc-speaches')
    expect(useAppStore.getState().sttTestStatus).toBe('idle')
    expect(screen.getByText('http://100.90.208.26:8000/v1')).toBeInTheDocument()
  })

  it('tests with the typed API key and saves it in the Keychain', async () => {
    vi.mocked(tauri.testSpeechPreset).mockResolvedValue(50)
    render(<SttSetupStep />)

    fireEvent.change(screen.getByLabelText('API key (optional)'), {
      target: { value: 'sk-speech' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))

    await waitFor(() => {
      expect(tauri.testSpeechPreset).toHaveBeenCalledWith(config().speech_presets[0], 'sk-speech')
      expect(tauri.setCredential).toHaveBeenCalledWith('stt', 'builtin-whisper-local', 'sk-speech')
    })
  })
})
