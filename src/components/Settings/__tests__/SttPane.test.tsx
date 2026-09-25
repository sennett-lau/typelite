import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { SttPane } from '../SttPane'
import * as tauri from '../../../lib/tauri'
import { BUILTIN_SPEECH_PRESET, useAppStore, type SpeechPreset } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const BUILTIN_ID = 'builtin-speech-local'

const secondPreset: SpeechPreset = {
  id: 'pc-speaches',
  name: 'PC Speaches',
  base_url: 'http://192.0.2.10:8000/v1',
  model: 'Systran/faster-whisper-large-v3',
  language: 'en',
  builtin: false,
  verified_at: null,
}

function config() {
  return useAppStore.getState().config
}

function activeSpeechPreset() {
  const { speech_presets, active_speech_preset_id } = config()
  return speech_presets.find((preset) => preset.id === active_speech_preset_id)
}

function addSecondPreset() {
  useAppStore.getState().updateConfig({
    speech_presets: [...config().speech_presets, secondPreset],
  })
}

function clientBufferLimit(
  overrides: Partial<tauri.ResolvedSttRecordingLimit> = {},
): tauri.ResolvedSttRecordingLimit {
  return {
    capability: {
      registryVersion: 1,
      providerId: BUILTIN_ID,
      transport: 'fileUpload',
      recommendedMaxSeconds: 600,
      hardMaxSeconds: 720,
      maxUploadBytes: 24 * 1024 * 1024,
      source: 'clientBuffer',
      explanationKey: 'recordingLimits.reasons.clientBuffer',
    },
    mode: 'auto',
    requestedSeconds: 600,
    effectiveMaxSeconds: 600,
    ...overrides,
  }
}

describe('SttPane', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState())
    // Most tests start from one preset, so the list tests stay short.
    useAppStore.getState().setConfig({
      ...config(),
      speech_presets: [{ ...BUILTIN_SPEECH_PRESET }],
    })
    vi.clearAllMocks()
    vi.mocked(tauri.readCredential).mockResolvedValue(null)
    vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
    vi.mocked(tauri.getSttRecordingCapability).mockResolvedValue(clientBufferLimit())
  })

  afterEach(() => {
    cleanup()
  })

  describe('Preset fields', () => {
    it('shows the built-in local whisper.cpp preset by default', () => {
      render(<SttPane />)

      expect(screen.getByLabelText('Preset')).toHaveValue(BUILTIN_ID)
      expect(screen.getByLabelText('Preset name')).toHaveValue('whisper.cpp on this Mac')
      expect(screen.getByLabelText('Base URL')).toHaveValue('http://127.0.0.1:8178/v1')
      expect(screen.getByLabelText('Model')).toHaveValue('large-v3-turbo')
      expect(screen.getByLabelText('Language')).toHaveValue('auto')
      expect(screen.getByText(/Built-in preset/)).toBeInTheDocument()
    })

    it('edits only the active preset', () => {
      addSecondPreset()
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Base URL'), {
        target: { value: 'http://127.0.0.1:9000/v1' },
      })
      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'small' } })
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh' } })

      expect(activeSpeechPreset()).toMatchObject({
        id: BUILTIN_ID,
        base_url: 'http://127.0.0.1:9000/v1',
        model: 'small',
        language: 'zh',
      })
      expect(config().speech_presets[1]).toEqual(secondPreset)
    })

    it('switches the active preset and shows its fields and key', async () => {
      addSecondPreset()
      vi.mocked(tauri.readCredential).mockImplementation(async (_namespace, id) =>
        id === 'pc-speaches' ? 'pc-secret' : null,
      )
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'pc-speaches' } })

      expect(config().active_speech_preset_id).toBe('pc-speaches')
      expect(screen.getByLabelText('Base URL')).toHaveValue('http://192.0.2.10:8000/v1')
      expect(screen.getByLabelText('Language')).toHaveValue('en')
      await waitFor(() => {
        expect(screen.getByLabelText('API key (optional)')).toHaveValue('pc-secret')
      })
      expect(tauri.readCredential).toHaveBeenCalledWith('stt', 'pc-speaches')
    })

    it('keeps preset changes as unsaved config so the DirtyBar can save them', () => {
      useAppStore.getState().setSavedConfig(config())
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Mac whisper' } })

      expect(activeSpeechPreset()?.name).toBe('Mac whisper')
      expect(useAppStore.getState().savedConfig?.speech_presets[0].name).toBe(
        'whisper.cpp on this Mac',
      )
    })
  })

  describe('Preset list', () => {
    it('saves a copy as a new active preset', () => {
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: /Save as new preset/ }))

      const presets = config().speech_presets
      expect(presets).toHaveLength(2)
      const created = presets[1]
      expect(created.id).not.toBe(BUILTIN_ID)
      expect(created).toMatchObject({
        name: 'whisper.cpp on this Mac copy',
        base_url: 'http://127.0.0.1:8178/v1',
        model: 'large-v3-turbo',
        builtin: false,
      })
      expect(config().active_speech_preset_id).toBe(created.id)
      expect(presets[0].builtin).toBe(true)
    })

    it('copies the API key to the new preset', async () => {
      vi.mocked(tauri.readCredential).mockResolvedValue('whisper-secret')
      render(<SttPane />)
      await waitFor(() => {
        expect(screen.getByLabelText('API key (optional)')).toHaveValue('whisper-secret')
      })

      fireEvent.click(screen.getByRole('button', { name: /Save as new preset/ }))

      const createdId = config().active_speech_preset_id
      expect(tauri.setCredential).toHaveBeenCalledWith('stt', createdId, 'whisper-secret')
    })

    it('does not delete the last preset', () => {
      render(<SttPane />)

      const deleteButton = screen.getByRole('button', { name: /Delete/ })
      expect(deleteButton).toBeDisabled()
      fireEvent.click(deleteButton)
      expect(config().speech_presets).toHaveLength(1)
    })

    it('deleting the active preset activates the first remaining one', () => {
      addSecondPreset()
      useAppStore.getState().updateConfig({ active_speech_preset_id: 'pc-speaches' })
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

      expect(config().speech_presets.map((preset) => preset.id)).toEqual([BUILTIN_ID])
      expect(config().active_speech_preset_id).toBe(BUILTIN_ID)
      expect(screen.getByLabelText('Preset')).toHaveValue(BUILTIN_ID)
    })
  })

  describe('API key', () => {
    it('loads the key from the Keychain for the active preset', async () => {
      vi.mocked(tauri.readCredential).mockResolvedValue('sk-local')
      render(<SttPane />)

      await waitFor(() => {
        expect(screen.getByLabelText('API key (optional)')).toHaveValue('sk-local')
      })
      expect(tauri.readCredential).toHaveBeenCalledWith('stt', BUILTIN_ID)
    })

    it('saves the typed key under the preset id and never in the config', async () => {
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('API key (optional)'), {
        target: { value: 'sk-new' },
      })

      await waitFor(() => {
        expect(tauri.setCredential).toHaveBeenCalledWith('stt', BUILTIN_ID, 'sk-new')
      })
      expect(JSON.stringify(config())).not.toContain('sk-new')
    })

    it('shows an inline error when the Keychain save fails', async () => {
      vi.mocked(tauri.setCredential).mockRejectedValueOnce(new Error('vault locked'))
      render(<SttPane />)

      const input = screen.getByLabelText('API key (optional)')
      fireEvent.change(input, { target: { value: 'sk-new' } })
      fireEvent.blur(input)

      expect(
        await screen.findByText('Could not save API key to OS vault. vault locked'),
      ).toBeInTheDocument()
    })
  })

  describe('Test button', () => {
    it('tests the active preset and shows the latency', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(1834)
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('1834 ms')).toBeInTheDocument()
      expect(tauri.testSpeechPreset).toHaveBeenCalledWith(
        { ...BUILTIN_SPEECH_PRESET, verified_at: null },
        '',
      )
      expect(useAppStore.getState().sttTestStatus).toBe('success')
      // A pass makes the preset ready, in the edited and the saved config alike.
      expect(activeSpeechPreset()?.verified_at).toEqual(expect.any(Number))
    })

    it('does not mark a preset with unsaved edits as ready in the saved config', async () => {
      useAppStore.getState().setSavedConfig(config())
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(10)
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'small' } })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      await waitFor(() => expect(activeSpeechPreset()?.verified_at).toEqual(expect.any(Number)))
      expect(useAppStore.getState().savedConfig?.speech_presets[0].verified_at).toBeNull()
    })

    it('fails a placeholder URL with a clear message without calling the server', async () => {
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Base URL'), {
        target: { value: 'http://<computer-ip>:8000/v1' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText(/Replace <computer-ip> in the base URL/)).toBeInTheDocument()
      expect(tauri.testSpeechPreset).not.toHaveBeenCalled()
      expect(activeSpeechPreset()?.verified_at).toBeNull()
    })

    it('typing a new API key forgets the passed test', () => {
      useAppStore.getState().setConfig({
        ...config(),
        speech_presets: [{ ...BUILTIN_SPEECH_PRESET, verified_at: 5 }],
      })
      useAppStore.getState().setSavedConfig(config())
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('API key (optional)'), {
        target: { value: 'sk-new' },
      })

      expect(activeSpeechPreset()?.verified_at).toBeNull()
      expect(useAppStore.getState().savedConfig?.speech_presets[0].verified_at).toBeNull()
    })

    it('passes the typed API key to the test', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(10)
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('API key (optional)'), {
        target: { value: 'sk-test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      await waitFor(() => {
        expect(tauri.testSpeechPreset).toHaveBeenCalledWith(
          expect.objectContaining({ id: BUILTIN_ID }),
          'sk-test',
        )
      })
    })

    it('shows the backend error when the test fails', async () => {
      vi.mocked(tauri.testSpeechPreset).mockRejectedValue('connection refused (127.0.0.1:8178)')
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('connection refused (127.0.0.1:8178)')).toBeInTheDocument()
      expect(useAppStore.getState().sttTestStatus).toBe('error')
    })

    it('is disabled without a base URL or model', () => {
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: '' } })

      expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
    })

    it('clears the last result when a field changes', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(900)
      render(<SttPane />)
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      expect(await screen.findByText('900 ms')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'small' } })

      expect(screen.queryByText('900 ms')).not.toBeInTheDocument()
      expect(useAppStore.getState().sttTestStatus).toBe('idle')
    })
  })

  describe('Recording limit', () => {
    it('shows the Rust-resolved Auto value and the client buffer reason', async () => {
      render(<SttPane />)

      expect(
        await screen.findByRole('option', { name: /Auto \(recommended,.*10 minutes/i }),
      ).toBeInTheDocument()
      expect(screen.getByText('Limited by the app’s safe local audio buffer.')).toBeInTheDocument()
      expect(tauri.getSttRecordingCapability).toHaveBeenCalledWith('auto', 600)
    })

    it('offers presets up to the hard maximum and a bounded custom entry', async () => {
      render(<SttPane />)

      const duration = await screen.findByLabelText('Single recording duration')
      expect(within(duration).getByRole('option', { name: '10 minutes' })).toBeInTheDocument()
      expect(within(duration).queryByRole('option', { name: '30 minutes' })).not.toBeInTheDocument()

      fireEvent.change(duration, { target: { value: 'custom' } })
      expect(config().recording_limit_mode).toBe('custom')

      const input = await screen.findByLabelText('Custom duration')
      expect(input).toHaveAttribute('min', '30')
      expect(input).toHaveAttribute('max', '720')
      fireEvent.change(input, { target: { value: '300' } })
      expect(config().custom_recording_limit_seconds).toBe(300)
    })

    it('describes the selected value against the app limit', async () => {
      useAppStore.getState().updateConfig({
        recording_limit_mode: 'custom',
        custom_recording_limit_seconds: 600,
      })
      vi.mocked(tauri.getSttRecordingCapability).mockResolvedValue(
        clientBufferLimit({ mode: 'custom' }),
      )

      render(<SttPane />)

      expect(
        await screen.findByText(
          'Selected: 10 minutes; app limit: 12 minutes. Limited by the app’s safe local audio buffer.',
        ),
      ).toBeInTheDocument()
      expect(tauri.getSttRecordingCapability).toHaveBeenCalledWith('custom', 600)
    })

    it('stores a preset duration from the single selector', async () => {
      render(<SttPane />)
      const duration = await screen.findByLabelText('Single recording duration')

      fireEvent.change(duration, { target: { value: '300' } })

      expect(config().recording_limit_mode).toBe('custom')
      expect(config().custom_recording_limit_seconds).toBe(300)
    })
  })
})
