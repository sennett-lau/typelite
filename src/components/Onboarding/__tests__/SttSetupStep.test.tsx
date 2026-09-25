import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SttSetupStep } from '../SttSetupStep'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

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

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('SttSetupStep', () => {
  it('shows the same editable preset fields as Settings, starting on the local template', () => {
    render(<SttSetupStep onSkip={vi.fn()} />)

    expect(screen.getByLabelText('Preset')).toHaveValue('builtin-speech-local')
    expect(screen.getByLabelText('Base URL')).toHaveValue('http://127.0.0.1:8178/v1')
    expect(screen.getByLabelText('Model')).toHaveValue('large-v3-turbo')
    expect(screen.getByLabelText('Language')).toHaveValue('auto')
    expect(screen.getByLabelText('API key (optional)')).toHaveValue('')
    expect(screen.getByRole('button', { name: /Save as new preset/ })).toBeInTheDocument()
  })

  it('lets the user edit the URL, for example for another computer', () => {
    render(<SttSetupStep onSkip={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'builtin-speech-lan' } })
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'http://192.0.2.10:8000/v1' },
    })

    expect(activePreset()).toMatchObject({
      id: 'builtin-speech-lan',
      base_url: 'http://192.0.2.10:8000/v1',
    })
  })

  it('a passing test makes speech ready and hides "Skip for now"', async () => {
    vi.mocked(tauri.testSpeechPreset).mockResolvedValue(2100)
    render(<SttSetupStep onSkip={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText(/2100 ms/)).toBeInTheDocument()
    expect(activePreset()?.verified_at).toEqual(expect.any(Number))
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
  })

  it('a failing test keeps the step open and shows why', async () => {
    vi.mocked(tauri.testSpeechPreset).mockRejectedValue('connection refused')
    render(<SttSetupStep onSkip={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText('connection refused')).toBeInTheDocument()
    expect(activePreset()?.verified_at).toBeNull()
  })

  it('"Skip for now" always leaves the step', () => {
    const onSkip = vi.fn()
    render(<SttSetupStep onSkip={onSkip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('"How to set this up" opens the guide with copyable commands and the full guide', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<SttSetupStep onSkip={vi.fn()} />)
    expect(screen.queryByTestId('setup-guide-speech')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /How to set this up/ }))

    const guide = screen.getByTestId('setup-guide-speech')
    expect(within(guide).getByText('This Mac')).toBeInTheDocument()
    expect(within(guide).getByText('Another computer on your network')).toBeInTheDocument()
    expect(within(guide).getByText('A cloud service with your own key')).toBeInTheDocument()
    expect(
      within(guide).getByText(/scripts\/setup-local-whisper\.sh from the repository/),
    ).toBeInTheDocument()

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
  })
})
