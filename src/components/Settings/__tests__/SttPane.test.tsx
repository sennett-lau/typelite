import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SttPane } from '../SttPane'
import * as tauri from '../../../lib/tauri'
import { BUILTIN_SPEECH_PRESETS, useAppStore, type SpeechPreset } from '../../../stores/appStore'
import { IDLE_SETUP_STATUS, useSpeechSetupStore } from '../../../stores/speechSetupStore'
import { hardwareCheck, installedBuiltin, serverPreset } from '../../../test-utils/speechHardware'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const BUILTIN_ID = 'builtin-speech-this-mac'

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

function setPresets(speech_presets: SpeechPreset[], active_speech_preset_id = BUILTIN_ID) {
  const next = { ...config(), speech_presets, active_speech_preset_id }
  useAppStore.getState().setConfig(next)
  useAppStore.getState().setSavedConfig(next)
}

function engine(name: RegExp) {
  return within(screen.getByRole('radiogroup', { name: 'Speech recognition uses' })).getByRole(
    'radio',
    { name },
  )
}

function modelCard(name: RegExp) {
  return within(screen.getByRole('radiogroup', { name: 'Model' })).getByRole('radio', { name })
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
    useSpeechSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null, hardware: null })
    setPresets(BUILTIN_SPEECH_PRESETS.map((preset) => ({ ...preset })))
    vi.clearAllMocks()
    vi.mocked(tauri.readCredential).mockResolvedValue(null)
    vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
    vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
    vi.mocked(tauri.getSttRecordingCapability).mockResolvedValue(clientBufferLimit())
    vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
    vi.mocked(tauri.listSpeechModels).mockResolvedValue([])
    vi.mocked(tauri.getSpeechHardware).mockResolvedValue(hardwareCheck(['large-v3-turbo', 'small']))
    vi.mocked(tauri.startSpeechSetup).mockResolvedValue(undefined)
    vi.mocked(tauri.cancelSpeechSetup).mockResolvedValue(true)
    vi.mocked(tauri.deleteSpeechModel).mockResolvedValue(undefined)
    vi.mocked(openUrl).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  describe('Speech recognition uses', () => {
    it('shows two option cards, with the engine in use selected', async () => {
      render(<SttPane />)

      expect(engine(/^Built-in/)).toHaveAttribute('aria-checked', 'true')
      expect(engine(/Your server or API key/)).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByTestId('builtin-settings')).toBeInTheDocument()
      // Details, then Language and Recording.
      expect(screen.getByLabelText('Spoken language')).toHaveValue('auto')
      expect(await screen.findByLabelText('Single recording duration')).toBeInTheDocument()
    })

    it('has one Learn more, on the "Speech recognition uses" header (plan `ai-polish-setup`)', async () => {
      const pc = serverPreset('pc', 'Speech server on my PC', 'http://192.0.2.10:8000/v1')
      setPresets([...BUILTIN_SPEECH_PRESETS.map((p) => ({ ...p })), pc], 'pc')
      render(<SttPane />)

      expect(screen.getAllByRole('button', { name: 'Learn more' })).toHaveLength(1)
      expect(screen.queryByText(/about supported services/)).not.toBeInTheDocument()
      fireEvent.click(engine(/^Built-in/))
      await waitFor(() => expect(screen.getByTestId('builtin-settings')).toBeInTheDocument())
      expect(screen.getAllByRole('button', { name: 'Learn more' })).toHaveLength(1)
    })

    it('when no model fits, Built-in is dimmed and the download section is hidden', async () => {
      vi.mocked(tauri.getSpeechHardware).mockResolvedValue(
        hardwareCheck([], { freeBytes: 100_000_000, neededBytes: 209_094_035 }),
      )
      render(<SttPane />)

      await waitFor(() => expect(engine(/^Built-in/)).toBeDisabled())
      expect(engine(/^Built-in/)).toHaveTextContent('Not available on this Mac')
      expect(engine(/Your server or API key/)).toHaveAttribute('aria-checked', 'true')
      expect(screen.queryByTestId('builtin-settings')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
      expect(screen.getByTestId('server-settings')).toBeInTheDocument()
    })

    it('with no saved preset, "Your server" shows the empty form and keeps Built-in in use', () => {
      render(<SttPane />)
      fireEvent.click(engine(/Your server or API key/))

      expect(engine(/Your server or API key/)).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByText('Add your server or API key')).toBeInTheDocument()
      expect(screen.getByLabelText('Address')).toHaveAttribute(
        'placeholder',
        'https://api.openai.com/v1',
      )
      expect(screen.getByLabelText('Model')).toHaveAttribute('placeholder', 'whisper-1')
      expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', 'Optional')
      expect(screen.getByLabelText('Name')).toHaveAttribute('placeholder', 'Filled in for you')
      expect(screen.queryByText('Delete this preset')).not.toBeInTheDocument()
      expect(config().active_speech_preset_id).toBe(BUILTIN_ID)
      expect(tauri.updateConfig).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Learn more' }))
      expect(openUrl).toHaveBeenCalledWith(
        'https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-services.md',
      )
    })

    it('choosing an engine makes it the one in use and saves at once', async () => {
      const groq = serverPreset(
        'groq',
        'Groq',
        'https://api.groq.com/openai/v1',
        'whisper-large-v3-turbo',
      )
      setPresets([...BUILTIN_SPEECH_PRESETS.map((p) => ({ ...p })), groq])
      render(<SttPane />)

      fireEvent.click(engine(/Your server or API key/))
      await waitFor(() => expect(config().active_speech_preset_id).toBe('groq'))
      expect(tauri.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ active_speech_preset_id: 'groq' }),
      )
      expect(useAppStore.getState().savedConfig?.active_speech_preset_id).toBe('groq')
      expect(screen.getByLabelText('Address')).toHaveValue('https://api.groq.com/openai/v1')
      expect(screen.getByLabelText('Model')).toHaveValue('whisper-large-v3-turbo')

      fireEvent.click(engine(/^Built-in/))
      await waitFor(() => expect(config().active_speech_preset_id).toBe(BUILTIN_ID))
      expect(screen.getByTestId('builtin-settings')).toBeInTheDocument()
    })

    it('the language edits the preset in use and waits for the Save bar', () => {
      render(<SttPane />)
      fireEvent.change(screen.getByLabelText('Spoken language'), { target: { value: 'en' } })

      expect(config().speech_presets[0].language).toBe('en')
      expect(useAppStore.getState().savedConfig?.speech_presets[0].language).toBe('auto')
      expect(tauri.updateConfig).not.toHaveBeenCalled()
    })
  })

  describe('Built-in details', () => {
    it('offers both models on a capable Mac, the larger one selected and recommended', async () => {
      render(<SttPane />)

      const best = await waitFor(() => modelCard(/Best accuracy/))
      expect(best).toHaveAttribute('aria-checked', 'true')
      expect(within(best).getByText('Recommended')).toBeInTheDocument()
      expect(modelCard(/Faster/)).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Apple M1 Pro · 32 GB')).toBeInTheDocument()

      const status = screen.getByTestId('builtin-status')
      expect(within(status).getByText('Not downloaded')).toBeInTheDocument()
      fireEvent.click(within(status).getByRole('button', { name: 'Download' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')

      fireEvent.click(modelCard(/Faster/))
      expect(modelCard(/Faster/)).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(within(status).getByRole('button', { name: 'Download' }))
      expect(tauri.startSpeechSetup).toHaveBeenLastCalledWith('small')
    })

    it('a Mac offered one model shows it selected, with the reason in the note', async () => {
      vi.mocked(tauri.getSpeechHardware).mockResolvedValue(
        hardwareCheck(['small'], {
          chipKind: 'intel',
          chipName: 'Intel Core i7',
          memoryBytes: 16 * 1024 ** 3,
          leftOut: 'needs_apple_silicon',
        }),
      )
      render(<SttPane />)

      const faster = await waitFor(() => modelCard(/Faster/))
      expect(faster).toHaveAttribute('aria-checked', 'true')
      expect(
        within(screen.getByRole('radiogroup', { name: 'Model' })).getAllByRole('radio'),
      ).toHaveLength(1)
      expect(
        screen.getByText('Intel Core i7 · 16 GB · The larger model needs an Apple Silicon Mac.'),
      ).toBeInTheDocument()
    })

    it('shows the model in use with Delete, which needs a second click', async () => {
      setPresets([installedBuiltin('large-v3-turbo', 5)])
      vi.mocked(tauri.listSpeechModels).mockResolvedValue(MODELS)
      render(<SttPane />)

      const status = screen.getByTestId('builtin-status')
      expect(await within(status).findByText('In use')).toBeInTheDocument()
      expect(within(status).getByText('Whisper large-v3-turbo · 574 MB')).toBeInTheDocument()

      fireEvent.click(within(status).getByRole('button', { name: 'Delete' }))
      expect(tauri.deleteSpeechModel).not.toHaveBeenCalled()
      fireEvent.click(within(status).getByRole('button', { name: 'Click again to delete' }))
      await waitFor(() => expect(tauri.deleteSpeechModel).toHaveBeenCalledWith('large-v3-turbo'))
    })

    it('shows a running download with a bar and Cancel, and a failure with Try again', async () => {
      render(<SttPane />)
      await waitFor(() => modelCard(/Best accuracy/))
      act(() => {
        useSpeechSetupStore.getState().applyStatus({
          ...IDLE_SETUP_STATUS,
          modelId: 'large-v3-turbo',
          phase: 'downloading',
          downloadedBytes: 241_000_000,
          totalBytes: 574_041_195,
          bytesPerSecond: 12_000_000,
        })
      })
      const status = screen.getByTestId('builtin-status')
      expect(within(status).getByText('Downloading 41%')).toBeInTheDocument()
      expect(within(status).getByText('Best accuracy · 241 of 574 MB')).toBeInTheDocument()
      expect(within(status).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '41')
      fireEvent.click(within(status).getByRole('button', { name: 'Cancel' }))
      expect(tauri.cancelSpeechSetup).toHaveBeenCalled()

      act(() => {
        useSpeechSetupStore.getState().applyStatus({
          ...IDLE_SETUP_STATUS,
          modelId: 'large-v3-turbo',
          phase: 'error',
          error: { code: 'network', reason: 'connection reset' },
        })
      })
      expect(within(status).getByText('Download failed')).toBeInTheDocument()
      fireEvent.click(within(status).getByRole('button', { name: 'Try again' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')
    })
  })

  describe('Your server or API key details', () => {
    const pc = serverPreset(
      'pc',
      'Speech server on my PC',
      'http://192.0.2.10:8000/v1',
      'Systran/faster-whisper-large-v3',
    )
    const groq = serverPreset(
      'groq',
      'Groq',
      'https://api.groq.com/openai/v1',
      'whisper-large-v3-turbo',
    )

    beforeEach(() => {
      setPresets([...BUILTIN_SPEECH_PRESETS.map((p) => ({ ...p })), pc, groq], 'pc')
    })

    it('puts the saved presets in a picker at the upper right, with + Add preset…', async () => {
      render(<SttPane />)

      expect(engine(/Your server or API key/)).toHaveAttribute('aria-checked', 'true')
      const picker = screen.getByLabelText('Saved presets')
      expect(
        within(picker)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Speech server on my PC', 'Groq', '+ Add preset…'])
      expect(screen.getByLabelText('Address')).toHaveValue('http://192.0.2.10:8000/v1')
      expect(screen.getByLabelText('Name')).toHaveValue('Speech server on my PC')

      fireEvent.change(picker, { target: { value: 'groq' } })
      await waitFor(() => expect(config().active_speech_preset_id).toBe('groq'))
      expect(screen.getByLabelText('Address')).toHaveValue('https://api.groq.com/openai/v1')

      fireEvent.change(screen.getByLabelText('Saved presets'), { target: { value: '__add__' } })
      expect(screen.getByLabelText('Address')).toHaveValue('')
      expect(screen.queryByText('Delete this preset')).not.toBeInTheDocument()
    })

    it('tests the edited fields with the typed key and saves them as ready', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(600)
      render(<SttPane />)

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'large-v3' } })
      fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      expect(await screen.findByText('Works · 600 ms')).toBeInTheDocument()
      expect(tauri.testSpeechPreset).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pc', model: 'large-v3' }),
        'sk-1',
      )

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(config().speech_presets.find((p) => p.id === 'pc')?.model).toBe('large-v3'),
      )
      expect(tauri.setCredential).toHaveBeenCalledWith('stt', 'pc', 'sk-1')
      expect(config().speech_presets.find((p) => p.id === 'pc')?.verified_at).toEqual(
        expect.any(Number),
      )
      expect(JSON.stringify(config())).not.toContain('sk-1')
    })

    it('deletes the selected preset after a second click and moves to the next one', async () => {
      render(<SttPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Delete this preset' }))
      expect(config().speech_presets).toHaveLength(3)
      fireEvent.click(screen.getByRole('button', { name: 'Click again to delete' }))

      await waitFor(() =>
        expect(config().speech_presets.map((p) => p.id)).toEqual([BUILTIN_ID, 'groq']),
      )
      expect(config().active_speech_preset_id).toBe('groq')
      expect(tauri.setCredential).toHaveBeenCalledWith('stt', 'pc', '')
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
