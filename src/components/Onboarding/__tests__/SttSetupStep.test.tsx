import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SttSetupStep } from '../SttSetupStep'
import * as tauri from '../../../lib/tauri'
import { BUILTIN_WHISPER_PRESET_ID, useAppStore } from '../../../stores/appStore'
import { IDLE_SETUP_STATUS, useSpeechSetupStore } from '../../../stores/speechSetupStore'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

function config() {
  return useAppStore.getState().config
}

function activePreset() {
  return config().speech_presets.find((preset) => preset.id === config().active_speech_preset_id)
}

function chooseType(name: 'Built-in (this Mac)' | 'Local server' | 'OpenAI-compatible') {
  fireEvent.click(within(screen.getByRole('group', { name: 'Type' })).getByText(name))
}

function setStatus(status: Partial<tauri.SpeechSetupStatus>) {
  act(() => {
    useSpeechSetupStore.getState().applyStatus({ ...IDLE_SETUP_STATUS, ...status })
  })
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useSpeechSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null })
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
  vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
  vi.mocked(tauri.listSpeechModels).mockResolvedValue([])
  vi.mocked(tauri.startSpeechSetup).mockResolvedValue(undefined)
  vi.mocked(tauri.cancelSpeechSetup).mockResolvedValue(true)
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('SttSetupStep', () => {
  describe('Quick setup (built-in)', () => {
    it('starts on Built-in with the Quick setup card and no other fields', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)

      const card = screen.getByTestId('quick-speech-setup')
      expect(within(card).getByText('Quick setup (recommended)')).toBeInTheDocument()
      expect(
        within(card).getByText(
          'Download a speech model (574 MB) and run it on this Mac. No other software needed.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument()
    })

    it('"Set up" downloads the default model; the link picks the smaller one', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')

      fireEvent.click(screen.getByRole('button', { name: 'Smaller and faster model (190 MB)' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('shows the download progress with size, speed, time left and Cancel', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      setStatus({
        modelId: 'small',
        phase: 'downloading',
        downloadedBytes: 95_000_000,
        totalBytes: 190_085_487,
        bytesPerSecond: 800_000,
      })

      const bar = screen.getByRole('progressbar', { name: 'Speech model download' })
      expect(bar).toHaveAttribute('aria-valuenow', '49')
      expect(screen.getByText('49%')).toBeInTheDocument()
      expect(screen.getByText('95 MB of 190 MB · 0.8 MB/s · about 2 min left')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Set up' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(tauri.cancelSpeechSetup).toHaveBeenCalledTimes(1)
    })

    it('says what happens after the download: checking, then testing', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)

      setStatus({ modelId: 'small', phase: 'verifying', totalBytes: 1, downloadedBytes: 1 })
      expect(screen.getByText('Checking the downloaded file…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()

      setStatus({ modelId: 'small', phase: 'testing', totalBytes: 1, downloadedBytes: 1 })
      expect(screen.getByText('Loading the model and running a test…')).toBeInTheDocument()
    })

    it.each([
      [
        { code: 'network', reason: 'connection reset' },
        'Could not download the model: connection reset. Check your connection and try again.',
      ],
      [
        { code: 'disk_space', neededBytes: 631_445_314, availableBytes: 300_000_000 },
        'Need 0.6 GB free to download the model; 0.3 GB available.',
      ],
      [{ code: 'checksum' }, 'The downloaded file was damaged, so it was deleted. Try again.'],
      [
        {
          code: 'load',
          reason: 'Could not load the speech model: failed to allocate. Try the smaller model.',
        },
        'Could not load the speech model: failed to allocate. Try the smaller model.',
      ],
    ] as const)('shows the error %j with Try again', (error, message) => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      setStatus({ modelId: 'large-v3-turbo', phase: 'error', error })

      expect(screen.getByText(message)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')
      // The smaller model stays one click away.
      expect(
        screen.getByRole('button', { name: 'Smaller and faster model (190 MB)' }),
      ).toBeInTheDocument()
    })

    it('a cancelled download offers Resume', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      setStatus({ modelId: 'small', phase: 'error', error: { code: 'cancelled' } })

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('picks up a download that is already running when the step opens', async () => {
      vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue({
        ...IDLE_SETUP_STATUS,
        modelId: 'large-v3-turbo',
        phase: 'downloading',
        downloadedBytes: 1_000_000,
        totalBytes: 574_041_195,
      })
      render(<SttSetupStep onSkip={vi.fn()} />)

      expect(
        await screen.findByRole('progressbar', { name: 'Speech model download' }),
      ).toBeInTheDocument()
    })

    it('once the backend adds the ready built-in preset, speech is ready and Skip goes', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()

      act(() => {
        useAppStore.getState().applyPersistedConfigPatch({
          speech_presets: [
            {
              id: BUILTIN_WHISPER_PRESET_ID,
              name: 'Built-in (this Mac)',
              kind: 'builtin',
              base_url: '',
              model: 'large-v3-turbo',
              model_file: 'ggml-large-v3-turbo-q5_0.bin',
              language: 'auto',
              builtin: true,
              verified_at: 42,
            },
            ...config().speech_presets,
          ],
          active_speech_preset_id: BUILTIN_WHISPER_PRESET_ID,
        })
        useSpeechSetupStore
          .getState()
          .applyStatus({ ...IDLE_SETUP_STATUS, modelId: 'large-v3-turbo', phase: 'ready' })
      })

      expect(screen.queryByTestId('quick-speech-setup')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Model')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Test' })).toBeEnabled()
      expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    })
  })

  describe('other types', () => {
    it('Local server shows address and model only (no language or key in onboarding)', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      chooseType('Local server')

      expect(screen.getByLabelText('Address')).toHaveValue('http://127.0.0.1:8178/v1')
      expect(screen.getByLabelText('Model')).toHaveValue('large-v3-turbo')
      expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('API key')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Preset name')).not.toBeInTheDocument()
    })

    it('typing an address keeps the type, even one that looks like a cloud service', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      chooseType('Local server')

      fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'h' } })
      fireEvent.change(screen.getByLabelText('Address'), {
        target: { value: 'https://speech.example.com/v1' },
      })

      expect(screen.getByLabelText('Address')).toHaveValue('https://speech.example.com/v1')
      expect(
        within(screen.getByRole('group', { name: 'Type' })).getByText('Local server'),
      ).toHaveAttribute('aria-pressed', 'true')
    })

    it('OpenAI-compatible asks for a key but not an address', () => {
      render(<SttSetupStep onSkip={vi.fn()} />)
      chooseType('OpenAI-compatible')

      expect(screen.getByLabelText('API key')).toBeInTheDocument()
      expect(screen.queryByLabelText('Address')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Language')).not.toBeInTheDocument()
    })

    it('a passing test makes speech ready and hides "Skip for now"', async () => {
      vi.mocked(tauri.testSpeechPreset).mockResolvedValue(2100)
      render(<SttSetupStep onSkip={vi.fn()} />)
      chooseType('Local server')

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('Works · 2.1 s')).toBeInTheDocument()
      expect(activePreset()?.verified_at).toEqual(expect.any(Number))
      expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    })

    it('a failing test keeps the step open and shows why', async () => {
      vi.mocked(tauri.testSpeechPreset).mockRejectedValue('connection refused')
      render(<SttSetupStep onSkip={vi.fn()} />)
      chooseType('Local server')

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      expect(await screen.findByText('connection refused')).toBeInTheDocument()
      expect(activePreset()?.verified_at).toBeNull()
    })
  })

  it('"Skip for now" always leaves the step', () => {
    const onSkip = vi.fn()
    render(<SttSetupStep onSkip={onSkip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('"How to set this up" opens the guide in a sheet with commands and the full guide', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<SttSetupStep onSkip={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'How to set this up' }))

    const sheet = screen.getByRole('dialog', { name: 'How to set this up' })
    const guide = within(sheet).getByTestId('setup-guide-speech')
    expect(within(guide).getByText('Built-in (easiest)')).toBeInTheDocument()
    expect(within(guide).getByText('This Mac')).toBeInTheDocument()
    expect(within(guide).getByText('Another computer on your network')).toBeInTheDocument()
    expect(within(guide).getByText('A cloud service with your own key')).toBeInTheDocument()

    fireEvent.click(within(guide).getByRole('button', { name: 'Copy command' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'curl -fsSL https://raw.githubusercontent.com/sennett-lau/typelite/main/scripts/setup-local-whisper.sh | bash',
      ),
    )

    fireEvent.click(within(guide).getByRole('button', { name: /Open full guide/ }))
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/sennett-lau/typelite/blob/main/docs/guides/speech-recognition.md',
    )

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
