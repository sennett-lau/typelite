import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { useAppStore } from '../../../stores/appStore'
import { IDLE_SETUP_STATUS, useSpeechSetupStore } from '../../../stores/speechSetupStore'
import * as tauri from '../../../lib/tauri'
import { WHATS_NEW } from '../../../lib/whatsNew'
import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'
import { HomePage } from '../index'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}))

/** Marks the active speech and/or AI preset as tested. */
function setReady(speech: boolean, ai: boolean) {
  const config = useAppStore.getState().config
  useAppStore.setState({
    config: {
      ...config,
      speech_presets: config.speech_presets.map((preset, index) =>
        index === 0 ? { ...preset, verified_at: speech ? 1 : null } : preset,
      ),
      ai_presets: config.ai_presets.map((preset, index) =>
        index === 0 ? { ...preset, verified_at: ai ? 1 : null } : preset,
      ),
    },
  })
}

function setHotkeys(
  partial: Partial<ReturnType<typeof useAppStore.getState>['config']['hotkeys']>,
) {
  const config = useAppStore.getState().config
  useAppStore.setState({ config: { ...config, hotkeys: { ...config.hotkeys, ...partial } } })
}

function hardware(models: string[]): tauri.SpeechHardwareCheck {
  return {
    hardware: {
      chipKind: models.includes('large-v3-turbo') ? 'apple_silicon' : 'intel',
      chipName: 'Apple M1 Pro',
      memoryBytes: 32 * 1024 ** 3,
      freeBytes: 50_000_000_000,
    },
    offer: {
      models: models.map((id, index) => ({
        id,
        sizeBytes: id === 'small' ? 190_085_487 : 574_041_195,
        recommended: index === 0 && models.length > 1,
      })),
      leftOut: models.includes('large-v3-turbo') ? null : 'needs_apple_silicon',
      neededBytes: null,
    },
  }
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useSpeechSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null, hardware: null })
  vi.clearAllMocks()
  vi.mocked(tauri.getSpeechHardware).mockResolvedValue(hardware(['large-v3-turbo', 'small']))
  vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
  vi.mocked(tauri.listSpeechModels).mockResolvedValue([])
  vi.mocked(tauri.startSpeechSetup).mockResolvedValue(undefined)
  vi.mocked(tauri.cancelSpeechSetup).mockResolvedValue(true)
  vi.mocked(tauri.getRunTimings).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('HomePage', () => {
  describe('Finish setup card', () => {
    it('shows a row per service that is not ready, each opening its Settings tab', async () => {
      render(<HomePage />)
      await waitFor(() => expect(useSpeechSetupStore.getState().hardware).not.toBeNull())

      const card = screen.getByRole('region', { name: 'Finish setup' })
      expect(within(card).getByTestId('finish-setup-speech')).toHaveTextContent('Not set up yet')
      expect(within(card).getByTestId('finish-setup-ai')).toHaveTextContent(
        'Dictate pastes the raw transcript',
      )

      // Speech: "Set up" starts the Built-in setup here with the first offered model (plan
      // 0015); "Other options" opens Settings.
      fireEvent.click(within(card).getByRole('button', { name: 'Set up: Speech recognition' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('large-v3-turbo')
      expect(window.location.hash).toBe('')
      fireEvent.click(within(card).getByRole('button', { name: 'Other options' }))
      expect(window.location.hash).toBe('#/settings?pane=stt')
      fireEvent.click(within(card).getByRole('button', { name: 'Set up: AI polish service' }))
      expect(window.location.hash).toBe('#/settings?pane=llm')
    })

    it('shows the Quick setup progress under the speech row until it is done', async () => {
      vi.mocked(tauri.getSpeechSetupStatus).mockResolvedValue({
        ...IDLE_SETUP_STATUS,
        modelId: 'large-v3-turbo',
        phase: 'downloading',
        downloadedBytes: 287_000_000,
        totalBytes: 574_041_195,
        bytesPerSecond: 10_000_000,
      })
      render(<HomePage />)

      const bar = await screen.findByRole('progressbar', { name: 'Speech model download' })
      expect(bar).toHaveAttribute('aria-valuenow', '49')
      expect(screen.getByText('Downloading 49%')).toBeInTheDocument()
      expect(screen.getByText('Best accuracy · 287 of 574 MB')).toBeInTheDocument()
      expect(screen.getByText('10 MB/s · about 29 s left')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Set up: Speech recognition' })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(tauri.cancelSpeechSetup).toHaveBeenCalled()
    })

    it('"Set up" picks the only model an Intel Mac is offered', async () => {
      vi.mocked(tauri.getSpeechHardware).mockResolvedValue(hardware(['small']))
      render(<HomePage />)
      await waitFor(() => expect(useSpeechSetupStore.getState().hardware).not.toBeNull())

      fireEvent.click(screen.getByRole('button', { name: 'Set up: Speech recognition' }))
      expect(tauri.startSpeechSetup).toHaveBeenCalledWith('small')
    })

    it('shows only the missing service and says when its last test failed', () => {
      setReady(true, false)
      useAppStore.setState({ aiHealth: { presetId: 'builtin-ai-this-mac', ok: false } })
      render(<HomePage />)

      expect(screen.queryByTestId('finish-setup-speech')).not.toBeInTheDocument()
      expect(screen.getByTestId('finish-setup-ai')).toHaveTextContent('The last test failed')
    })

    it('is hidden when both services are ready', () => {
      setReady(true, true)
      render(<HomePage />)
      expect(screen.queryByRole('region', { name: 'Finish setup' })).not.toBeInTheDocument()
    })
  })

  describe('shortcut tour link', () => {
    it('shows while both services work and the tour is not done, and starts the tour', () => {
      setReady(true, true)
      useAppStore.setState({ onboardingCompleted: true })
      render(<HomePage />)

      fireEvent.click(screen.getByRole('button', { name: 'Take the shortcut tour' }))
      expect(useAppStore.getState().onboardingTour).toBe(true)
      expect(useAppStore.getState().onboardingStep).toBe(4)
      expect(useAppStore.getState().onboardingCompleted).toBe(false)
    })

    it('is hidden while a service is missing or once the tour is done', () => {
      setReady(true, false)
      const { unmount } = render(<HomePage />)
      expect(screen.queryByText('Take the shortcut tour')).not.toBeInTheDocument()
      unmount()

      setReady(true, true)
      useAppStore.setState({
        config: { ...useAppStore.getState().config, shortcut_tour_completed: true },
      })
      render(<HomePage />)
      expect(screen.queryByText('Take the shortcut tour')).not.toBeInTheDocument()
    })
  })

  it('starts with the welcome header and no usage counters', () => {
    render(<HomePage />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to Typelite')
    expect(screen.queryByText('Total Recordings')).not.toBeInTheDocument()
    expect(screen.queryByText('Today')).not.toBeInTheDocument()
  })

  it('shows one shortcut row per feature with key caps from the live config', () => {
    setHotkeys({
      dictationBindings: [{ primary: 'End', modifiers: [] }],
      dictation: { primary: 'End', modifiers: [] },
      translateBindings: [{ primary: 'RightShift', modifiers: ['End'] }],
      translate: { primary: 'RightShift', modifiers: ['End'] },
      askBindings: [],
      ask: null,
      editSelection: null,
      switchScene: null,
      openApp: null,
    })
    const config = useAppStore.getState().config
    useAppStore.setState({
      config: { ...config, translation: { ...config.translation, active_target: 'ja' } },
    })

    render(<HomePage />)

    const dictate = screen.getByTestId('shortcut-row-dictate')
    expect(dictate).toHaveTextContent('Dictate')
    expect(dictate).toHaveTextContent('Speak and paste polished text')
    expect(Array.from(dictate.querySelectorAll('kbd')).map((kbd) => kbd.textContent)).toEqual([
      'End',
    ])

    const translateRow = screen.getByTestId('shortcut-row-translate')
    expect(translateRow).toHaveTextContent('Speak and paste it in 日本語')
    expect(Array.from(translateRow.querySelectorAll('kbd')).map((kbd) => kbd.textContent)).toEqual([
      'End',
      'Right Shift',
    ])

    const ask = screen.getByTestId('shortcut-row-ask')
    expect(ask).toHaveTextContent('Ask anything')
    expect(ask).toHaveTextContent('Not set')
    expect(ask.querySelectorAll('kbd')).toHaveLength(0)

    expect(screen.queryByTestId('shortcut-row-editSelection')).not.toBeInTheDocument()
  })

  it('shows the Switch language key under Translate when there is a language to switch to', () => {
    const config = useAppStore.getState().config
    useAppStore.setState({
      config: {
        ...config,
        translation: { targets: ['en'], active_target: 'en' },
      },
    })
    const { unmount } = render(<HomePage />)
    expect(screen.getByTestId('shortcut-row-translate')).not.toHaveTextContent('switch language')
    unmount()

    useAppStore.setState({
      config: {
        ...config,
        translation: { targets: ['en', 'zh-Hant-TW'], active_target: 'zh-Hant-TW' },
      },
    })
    render(<HomePage />)
    const translateRow = screen.getByTestId('shortcut-row-translate')
    expect(translateRow).toHaveTextContent('Speak and paste it in Chinese (Traditional, Taiwan)')
    expect(translateRow).toHaveTextContent('Shift (either side) to switch language')
  })

  it('adds a row for an extra feature only when it has a shortcut', () => {
    setHotkeys({ editSelection: { primary: 'E', modifiers: ['Command', 'Shift'] } })

    render(<HomePage />)

    const row = screen.getByTestId('shortcut-row-editSelection')
    expect(row).toHaveTextContent('Edit selection')
    expect(row.querySelectorAll('kbd').length).toBe(3)
  })

  it('opens Settings → General from the shortcuts panel', () => {
    render(<HomePage />)

    fireEvent.click(screen.getByTestId('shortcut-row-dictate'))
    expect(window.location.hash).toBe('#/settings?pane=general')
  })

  it('lists the current configuration without repeating the shortcuts', () => {
    const config = useAppStore.getState().config
    useAppStore.setState({
      config: {
        ...config,
        input_device: 'USB Mic',
        polish_enabled: false,
        output_mode: 'clipboard',
      },
    })

    render(<HomePage />)

    const card = screen.getByRole('region', { name: 'Your setup' })
    expect(within(card).getByTestId('config-row-microphone')).toHaveTextContent('USB Mic')
    expect(within(card).getByTestId('config-row-speech')).toHaveTextContent('Built-in (this Mac)')
    expect(within(card).getByTestId('config-row-ai')).toHaveTextContent('qwen3-4b')
    expect(within(card).getByTestId('config-row-polish')).toHaveTextContent('Disabled')
    expect(within(card).getByTestId('config-row-output')).toHaveTextContent('Paste from clipboard')
    expect(card.querySelectorAll('kbd')).toHaveLength(0)
  })

  it('shows the Speed board, empty until the first run', () => {
    render(<HomePage />)
    const board = screen.getByRole('region', { name: 'Speed' })
    expect(board).toHaveTextContent('Dictate once to see where the time goes.')
  })

  it('shows the system default microphone when none is chosen', () => {
    render(<HomePage />)
    expect(screen.getByTestId('config-row-microphone')).toHaveTextContent('System default')
  })

  it.each([
    ['microphone', 'general'],
    ['speech', 'stt'],
    ['ai', 'llm'],
    ['polish', 'llm'],
    ['output', 'general'],
  ])('the %s row opens the %s settings section', (row, pane) => {
    render(<HomePage />)
    fireEvent.click(screen.getByTestId(`config-row-${row}`))
    expect(window.location.hash).toBe(`#/settings?pane=${pane}`)
  })

  it("renders What's New from the release list, newest first", () => {
    render(<HomePage />)

    const section = screen.getByRole('region', { name: "What's New" })
    const releases = within(section).getAllByRole('article')
    expect(releases.map((release) => release.getAttribute('aria-label'))).toEqual(
      WHATS_NEW.map((entry) => `v${entry.version}`),
    )
    const first = within(releases[0]).getAllByRole('listitem')
    expect(first).toHaveLength(WHATS_NEW[0].changeKeys.length)
    expect(first[first.length - 1]).toHaveTextContent('No history')
  })
})

describe("What's New data", () => {
  it('starts with the 0.1.0 release and has text for every change in both languages', () => {
    expect(WHATS_NEW[0].version).toBe('0.1.0')
    const lookup = (messages: Record<string, unknown>, key: string) =>
      (messages.whatsNew as Record<string, string>)[key]
    for (const entry of WHATS_NEW) {
      for (const key of entry.changeKeys) {
        expect(lookup(en, key), `en ${key}`).toBeTruthy()
        expect(lookup(zh, key), `zh ${key}`).toBeTruthy()
      }
    }
  })
})
