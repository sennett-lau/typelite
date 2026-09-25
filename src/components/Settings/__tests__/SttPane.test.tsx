import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { SttPane } from '../SttPane'
import * as tauri from '../../../lib/tauri'
import {
  BUILTIN_SPEECH_PRESETS,
  BUILTIN_WHISPER_PRESET_ID,
  useAppStore,
  type SpeechPreset,
} from '../../../stores/appStore'
import { IDLE_SETUP_STATUS, useSpeechSetupStore } from '../../../stores/speechSetupStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const LOCAL_ID = 'builtin-speech-local'

const customPreset: SpeechPreset = {
  id: 'pc-speaches',
  name: 'PC Speaches',
  base_url: 'http://192.0.2.10:8000/v1',
  model: 'Systran/faster-whisper-large-v3',
  language: 'en',
  builtin: false,
  verified_at: null,
}

const builtinPreset: SpeechPreset = {
  id: BUILTIN_WHISPER_PRESET_ID,
  name: 'Built-in (this Mac)',
  kind: 'builtin',
  base_url: '',
  model: 'large-v3-turbo',
  model_file: 'ggml-large-v3-turbo-q5_0.bin',
  language: 'auto',
  builtin: true,
  verified_at: 5,
}

const MODELS: tauri.SpeechModelInfo[] = [
  {
    id: 'large-v3-turbo',
    fileName: 'ggml-large-v3-turbo-q5_0.bin',
    sizeBytes: 574_041_195,
    installed: true,
  },
  { id: 'small', fileName: 'ggml-small-q5_1.bin', sizeBytes: 190_085_487, installed: false },
]

function config() {
  return useAppStore.getState().config
}

function activeSpeechPreset() {
  const { speech_presets, active_speech_preset_id } = config()
  return speech_presets.find((preset) => preset.id === active_speech_preset_id)
}

function setPresets(speech_presets: SpeechPreset[], active_speech_preset_id = LOCAL_ID) {
  useAppStore.getState().setConfig({ ...config(), speech_presets, active_speech_preset_id })
}

function templates(): SpeechPreset[] {
  return BUILTIN_SPEECH_PRESETS.map((preset) => ({ ...preset }))
}

function chooseType(name: 'Built-in (this Mac)' | 'Local server' | 'OpenAI-compatible') {
  fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByText(name))
}

function clientBufferLimit(
  overrides: Partial<tauri.ResolvedSttRecordingLimit> = {},
): tauri.ResolvedSttRecordingLimit {
  return {
    capability: {
      registryVersion: 1,
      providerId: LOCAL_ID,
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
    useSpeechSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null })
    setPresets(templates())
    vi.clearAllMocks()
    vi.mocked(tauri.readCredential).mockResolvedValue(null)
    vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
    vi.mocked(tauri.getSttRecordingCapability).mockResolvedValue(clientBufferLimit())
    vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
    vi.mocked(tauri.listSpeechModels).mockResolvedValue([])
    vi.mocked(tauri.startSpeechSetup).mockResolvedValue(undefined)
    vi.mocked(tauri.deleteSpeechModel).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  describe('Type picker', () => {
    it('opens on Built-in with Quick setup while speech is not set up', () => {
      render(<SttPane />)

      const type = screen.getByRole('group', { name: 'Type' })
      expect(within(type).getByText('Built-in (this Mac)')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('quick-speech-setup')).toBeInTheDocument()
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
    })

    it('opens on the type of a ready preset', () => {
      setPresets([...templates(), { ...customPreset, verified_at: 1 }], 'pc-speaches')
      render(<SttPane />)

      expect(
        within(screen.getByRole('group', { name: 'Type' })).getByText('Local server'),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Address')).toHaveValue('http://192.0.2.10:8000/v1')
    })

    it('Local server shows address, model and language, but no API key or name', () => {
      render(<SttPane />)
      chooseType('Local server')

      expect(config().active_speech_preset_id).toBe(LOCAL_ID)
      expect(screen.getByLabelText('Address')).toHaveValue('http://127.0.0.1:8178/v1')
      expect(screen.getByLabelText('Model')).toHaveValue('large-v3-turbo')
      expect(screen.getByLabelText('Language')).toHaveValue('auto')
      expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Preset name')).not.toBeInTheDocument()
    })

    it('OpenAI-compatible picks a service; the address shows only for Custom', () => {
      render(<SttPane />)
      chooseType('OpenAI-compatible')

      expect(config().active_speech_preset_id).toBe('builtin-speech-openai')
      const serviceGroup = screen.getByRole('group', { name: 'Service' })
      expect(within(serviceGroup).getByText('OpenAI')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('API key')).toBeInTheDocument()
      expect(screen.getByLabelText('Model')).toHaveValue('whisper-1')
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()

      fireEvent.click(within(serviceGroup).getByText('Groq'))
      expect(activeSpeechPreset()).toMatchObject({
        id: 'builtin-speech-groq',
        base_url: 'https://api.groq.com/openai/v1',
      })
      expect(screen.getByLabelText('Model')).toHaveValue('whisper-large-v3-turbo')

      fireEvent.click(within(serviceGroup).getByText('Custom'))
      const created = activeSpeechPreset()!
      expect(created.builtin).toBe(false)
      expect(screen.getByLabelText('Address')).toHaveValue('')
      expect(screen.getByLabelText('Preset name')).toHaveValue('My speech preset')
      expect(
        within(screen.getByRole('group', { name: 'Service' })).getByText('Custom'),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('maps existing presets onto a type by their address', () => {
      const cloud: SpeechPreset = {
        ...customPreset,
        id: 'my-cloud',
        name: 'My cloud',
        base_url: 'https://speech.example.com/v1',
        verified_at: 1,
      }
      setPresets([...templates(), cloud], 'my-cloud')
      render(<SttPane />)

      expect(
        within(screen.getByRole('group', { name: 'Type' })).getByText('OpenAI-compatible'),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(
        within(screen.getByRole('group', { name: 'Service' })).getByText('Custom'),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Address')).toHaveValue('https://speech.example.com/v1')
    })

    it('edits only the active preset and keeps edits unsaved for the DirtyBar', () => {
      useAppStore.getState().setSavedConfig(config())
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'small' } })
      fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh' } })

      expect(activeSpeechPreset()).toMatchObject({ id: LOCAL_ID, model: 'small', language: 'zh' })
      expect(config().speech_presets[2]).toEqual(templates()[2])
      expect(useAppStore.getState().savedConfig?.speech_presets[0].model).toBe('large-v3-turbo')
    })
  })

  describe('Saved presets', () => {
    it('lists only the user’s presets and switches to one', async () => {
      setPresets([...templates(), customPreset])
      vi.mocked(tauri.readCredential).mockImplementation(async (_namespace, id) =>
        id === 'pc-speaches' ? 'pc-secret' : null,
      )
      render(<SttPane />)

      const menu = screen.getByLabelText('Saved presets')
      const options = within(menu)
        .getAllByRole('option')
        .map((option) => option.textContent)
      expect(options).toEqual(['Saved presets', 'PC Speaches'])

      fireEvent.change(menu, { target: { value: 'pc-speaches' } })

      expect(config().active_speech_preset_id).toBe('pc-speaches')
      expect(screen.getByLabelText('Preset name')).toHaveValue('PC Speaches')
      expect(screen.getByLabelText('Address')).toHaveValue('http://192.0.2.10:8000/v1')
      expect(screen.getByLabelText('Language')).toHaveValue('en')
      await waitFor(() => expect(tauri.readCredential).toHaveBeenCalledWith('stt', 'pc-speaches'))
    })

    it('"Add new preset…" adds a named preset of the shown type', () => {
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.change(screen.getByLabelText('Saved presets'), { target: { value: '__add__' } })

      const created = activeSpeechPreset()!
      expect(config().speech_presets).toHaveLength(5)
      expect(created).toMatchObject({
        name: 'My speech preset',
        base_url: 'http://127.0.0.1:8178/v1',
        builtin: false,
      })
      fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Studio PC' } })
      expect(activeSpeechPreset()?.name).toBe('Studio PC')
      expect(screen.getByLabelText('Saved presets')).toHaveValue(created.id)
    })

    it('deletes the selected custom preset and goes back to the type’s template', () => {
      setPresets([...templates(), customPreset], 'pc-speaches')
      render(<SttPane />)

      const menu = screen.getByLabelText('Saved presets')
      expect(within(menu).getByText('Delete “PC Speaches”')).toBeInTheDocument()
      fireEvent.change(menu, { target: { value: '__delete__' } })

      expect(config().speech_presets.map((preset) => preset.id)).not.toContain('pc-speaches')
      expect(config().active_speech_preset_id).toBe(LOCAL_ID)
    })

    it('offers a changed Local server address as its own preset', () => {
      render(<SttPane />)
      chooseType('Local server')
      expect(screen.queryByRole('button', { name: 'Save as a preset' })).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Address'), {
        target: { value: 'http://192.0.2.10:8000/v1' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Save as a preset' }))

      expect(activeSpeechPreset()).toMatchObject({
        name: 'Local server — 192.0.2.10',
        base_url: 'http://192.0.2.10:8000/v1',
        builtin: false,
      })
      const template = config().speech_presets.find((preset) => preset.id === LOCAL_ID)
      expect(template?.base_url).toBe('http://127.0.0.1:8178/v1')
    })
  })

  describe('API key (OpenAI-compatible only)', () => {
    it('loads the key from the Keychain for the active preset', async () => {
      vi.mocked(tauri.readCredential).mockResolvedValue('sk-openai')
      render(<SttPane />)
      chooseType('OpenAI-compatible')

      await waitFor(() => {
        expect(screen.getByLabelText('API key')).toHaveValue('sk-openai')
      })
      expect(tauri.readCredential).toHaveBeenCalledWith('stt', 'builtin-speech-openai')
    })

    it('saves the typed key under the preset id and never in the config', async () => {
      render(<SttPane />)
      chooseType('OpenAI-compatible')

      fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-new' } })

      await waitFor(() => {
        expect(tauri.setCredential).toHaveBeenCalledWith('stt', 'builtin-speech-openai', 'sk-new')
      })
      expect(JSON.stringify(config())).not.toContain('sk-new')
    })

    it('shows an inline error when the Keychain save fails', async () => {
      vi.mocked(tauri.setCredential).mockRejectedValueOnce(new Error('vault locked'))
      render(<SttPane />)
      chooseType('OpenAI-compatible')

      const input = screen.getByLabelText('API key')
      fireEvent.change(input, { target: { value: 'sk-new' } })
      fireEvent.blur(input)

      expect(
        await screen.findByText('Could not save API key to OS vault. vault locked'),
      ).toBeInTheDocument()
    })

    it('typing a new API key forgets the passed test', () => {
      setPresets(
        templates().map((preset) =>
          preset.id === 'builtin-speech-openai' ? { ...preset, verified_at: 5 } : preset,
        ),
        'builtin-speech-openai',
      )
      useAppStore.getState().setSavedConfig(config())
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-new' } })

      expect(activeSpeechPreset()?.verified_at).toBeNull()
    })

    it('passes the typed key to the test', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(10)
      render(<SttPane />)
      chooseType('OpenAI-compatible')

      fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test' } })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      await waitFor(() => {
        expect(tauri.testSpeechPreset).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'builtin-speech-openai' }),
          'sk-test',
        )
      })
    })
  })

  describe('Test button', () => {
    it('tests the active preset and shows the result on the same line', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(1834)
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('Works · 1.8 s')).toBeInTheDocument()
      expect(tauri.testSpeechPreset).toHaveBeenCalledWith(templates()[0], '')
      expect(useAppStore.getState().sttTestStatus).toBe('success')
      expect(activeSpeechPreset()?.verified_at).toEqual(expect.any(Number))
    })

    it('does not mark a preset with unsaved edits as ready in the saved config', async () => {
      useAppStore.getState().setSavedConfig(config())
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(10)
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'small' } })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      await waitFor(() => expect(activeSpeechPreset()?.verified_at).toEqual(expect.any(Number)))
      expect(useAppStore.getState().savedConfig?.speech_presets[0].verified_at).toBeNull()
    })

    it('fails a placeholder URL with a clear message without calling the server', async () => {
      setPresets(templates(), 'builtin-speech-lan')
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText(/Replace <computer-ip> in the base URL/)).toBeInTheDocument()
      expect(tauri.testSpeechPreset).not.toHaveBeenCalled()
    })

    it('shows the backend error when the test fails', async () => {
      vi.mocked(tauri.testSpeechPreset).mockRejectedValue('connection refused (127.0.0.1:8178)')
      render(<SttPane />)
      chooseType('Local server')

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('connection refused (127.0.0.1:8178)')).toBeInTheDocument()
      expect(useAppStore.getState().sttTestStatus).toBe('error')
    })

    it('is disabled without a model, and a field change clears the last result', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(900)
      render(<SttPane />)
      chooseType('Local server')
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      expect(await screen.findByText('Works · 900 ms')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: '' } })

      expect(screen.queryByText('Works · 900 ms')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
    })
  })

  describe('Built-in (this Mac)', () => {
    beforeEach(() => {
      setPresets([builtinPreset, ...templates()], BUILTIN_WHISPER_PRESET_ID)
      vi.mocked(tauri.listSpeechModels).mockResolvedValue(MODELS)
    })

    it('shows the installed model, language and Test, but no address or key', async () => {
      render(<SttPane />)

      expect(
        within(screen.getByRole('group', { name: 'Type' })).getByText('Built-in (this Mac)'),
      ).toHaveAttribute('aria-pressed', 'true')
      const model = screen.getByLabelText('Model')
      await waitFor(() =>
        expect(within(model).getByText('Large v3 Turbo (most accurate)')).toBeInTheDocument(),
      )
      expect(model).toHaveValue('ggml-large-v3-turbo-q5_0.bin')
      expect(screen.getByLabelText('Language')).toHaveValue('auto')
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
      expect(screen.queryByTestId('quick-speech-setup')).not.toBeInTheDocument()
    })

    it('tests the built-in preset without a key', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(640)
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('Works · 640 ms')).toBeInTheDocument()
      expect(tauri.testSpeechPreset).toHaveBeenCalledWith(builtinPreset, '')
    })

    it('offers the model that is not installed yet', async () => {
      render(<SttPane />)

      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Also download Small (smaller and faster) (190 MB)',
        }),
      )
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('lists installed models with their size and deletes one after a second click', async () => {
      render(<SttPane />)

      const group = await screen.findByRole('region', { name: 'Built-in models' })
      const row = within(group).getByTestId('builtin-model-large-v3-turbo')
      expect(row).toHaveTextContent('ggml-large-v3-turbo-q5_0.bin · 574 MB · in use')
      expect(within(group).queryByTestId('builtin-model-small')).not.toBeInTheDocument()

      const button = within(row).getByRole('button', {
        name: 'Delete: Large v3 Turbo (most accurate)',
      })
      fireEvent.click(button)
      expect(tauri.deleteSpeechModel).not.toHaveBeenCalled()
      expect(button).toHaveTextContent('Click again to delete')
      fireEvent.click(button)

      await waitFor(() => expect(tauri.deleteSpeechModel).toHaveBeenCalledWith('large-v3-turbo'))
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
