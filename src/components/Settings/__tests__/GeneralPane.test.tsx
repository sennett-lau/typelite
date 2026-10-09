/**
 * Settings → General (plan `general-settings`): Shortcuts, Recording and Output groups, and the
 * controls in them writing to the config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { useAppStore } from '../../../stores/appStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('../../../lib/tauri', () => ({
  HANDS_FREE_SETUP_EVENT: 'hands-free:setup',
  getHandsFreeStatus: vi.fn().mockResolvedValue({
    listener: 'off',
    modelInstalled: false,
    modelSizeBytes: 59707625,
    setup: {
      modelId: null,
      phase: 'idle',
      downloadedBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      error: null,
    },
  }),
  downloadHandsFreeModel: vi.fn().mockResolvedValue(undefined),
  cancelHandsFreeModelDownload: vi.fn().mockResolvedValue(true),
  getPlatformCapabilities: vi.fn().mockResolvedValue({
    os: 'macos',
    sessionType: 'unknown',
    globalHotkeyReliable: true,
    keyboardOutputReliable: true,
    clipboardAutoPasteReliable: true,
  }),
  getHotkeyStatus: vi.fn().mockResolvedValue({
    dictation: { value: 'Fn', valid: true },
    ask: { value: 'Fn+Space', valid: true },
    conflict: false,
    registration_error: null,
    roles: [],
  }),
  resumeHotkey: vi.fn().mockResolvedValue(undefined),
  pauseHotkey: vi.fn().mockResolvedValue(undefined),
  startAskFlow: vi.fn().mockResolvedValue(undefined),
  SHORTCUT_CAPTURE_EVENT: 'hotkey:capture',
  startShortcutCapture: vi.fn().mockResolvedValue(undefined),
  stopShortcutCapture: vi.fn().mockResolvedValue(undefined),
  listInputDevices: vi.fn().mockResolvedValue([
    { name: 'MacBook Pro Microphone', is_default: true },
    { name: 'USB Mic', is_default: false },
  ]),
  startMicLevelMonitor: vi.fn().mockResolvedValue({
    device_name: 'MacBook Pro Microphone',
    requested_device_missing: false,
  }),
  stopMicLevelMonitor: vi.fn().mockResolvedValue(undefined),
}))

import { GeneralPane } from '../GeneralPane'

const originalPlatform = window.navigator.platform

function setPlatform(value: string) {
  Object.defineProperty(window.navigator, 'platform', { value, configurable: true })
}

function config() {
  return useAppStore.getState().config
}

beforeEach(() => {
  setPlatform('MacIntel')
  useAppStore.setState(useAppStore.getInitialState())
  useAppStore.getState().updateConfig({ hotkey: 'Fn', ask_hotkey: 'Fn+Space' })
})

afterEach(() => {
  cleanup()
  setPlatform(originalPlatform)
})

describe('GeneralPane', () => {
  it('offers the configured shortcut roles and keeps Cancel read-only', () => {
    render(<GeneralPane />)
    const shortcuts = screen.getByRole('region', { name: 'settings.hotkey' })

    for (const label of [
      'home.shortcuts.dictate',
      'home.shortcuts.translate',
      'settings.switchLanguageHotkey',
      'home.shortcuts.ask',
      'settings.generalPane.cancel',
    ]) {
      expect(within(shortcuts).getByText(label)).toBeInTheDocument()
    }

    const cancel = screen.getByTestId('shortcut-cancel')
    expect(within(cancel).getByTitle('Escape')).toBeInTheDocument()
    expect(within(cancel).queryByRole('button')).toBeNull()
  })

  it('has no Switch language control off macOS', () => {
    setPlatform('Win32')
    render(<GeneralPane />)
    const shortcuts = screen.getByRole('region', { name: 'settings.hotkey' })

    expect(within(shortcuts).queryByText('settings.switchLanguageHotkey')).toBeNull()
    expect(shortcuts.querySelector('[data-hotkey-role="switchLanguage"]')).toBeNull()
  })

  it('names the Translate languages the switch key moves through, in list order', () => {
    useAppStore.getState().updateConfig({
      translation: { targets: ['en', 'ja', 'fr'], active_target: 'ja' },
    })
    render(<GeneralPane />)

    expect(screen.getByText('English → 日本語 → Français')).toBeInTheDocument()
  })

  it('Start and stop switches between press-to-toggle and hold to talk', () => {
    useAppStore.getState().updateConfig({ hotkey_mode: 'toggle' })
    render(<GeneralPane />)
    const control = screen.getByRole('group', { name: 'settings.generalPane.startStop' })
    const options = within(control)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(options).toEqual(['settings.generalPane.pressToggle', 'settings.generalPane.holdToTalk'])

    fireEvent.click(within(control).getByText('settings.generalPane.holdToTalk'))
    expect(config().hotkey_mode).toBe('hold')
    expect(config().hotkeys.dictationMode).toBe('hold')

    fireEvent.click(within(control).getByText('settings.generalPane.pressToggle'))
    expect(config().hotkey_mode).toBe('toggle')
  })

  it('picks the microphone, shows the input level and toggles muting', async () => {
    render(<GeneralPane />)
    const recording = screen.getByRole('region', { name: 'settings.generalPane.recording' })

    const picker = within(recording).getByLabelText('settings.generalPane.microphone')
    await waitFor(() => expect(within(picker).getByText('USB Mic')).toBeDefined())
    fireEvent.change(picker, { target: { value: 'USB Mic' } })
    expect(config().input_device).toBe('USB Mic')

    expect(within(recording).getByRole('meter', { name: 'mic.level' })).toBeDefined()

    const mute = within(recording).getByRole('switch', {
      name: 'settings.muteOutputWhileRecording',
    })
    fireEvent.click(mute)
    expect(config().mute_output_while_recording).toBe(true)
  })

  it('Output chooses between pasting and typing', () => {
    render(<GeneralPane />)
    const control = screen.getByRole('group', { name: 'settings.generalPane.outputBy' })

    fireEvent.click(within(control).getByText('settings.generalPane.pasting'))
    expect(config().output_mode).toBe('clipboard')
    expect(config().insertion_strategy).toBe('clipboardPaste')

    fireEvent.click(within(control).getByText('settings.generalPane.typing'))
    expect(config().output_mode).toBe('keyboard')
    expect(config().insertion_strategy).toBe('auto')
  })
})
