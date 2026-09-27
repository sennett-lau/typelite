/**
 * Settings → General (plan `general-settings`): Shortcuts, Recording and Output groups, and the
 * controls in them writing to the config.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react'
import { useAppStore } from '../../../stores/appStore'
import en from '../../../i18n/locales/en.json'
import zh from '../../../i18n/locales/zh.json'

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
  it('shows the Shortcuts, Recording and Output groups in that order', () => {
    render(<GeneralPane />)

    const groups = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))
    expect(groups).toEqual([
      'settings.hotkey',
      'settings.generalPane.recording',
      'settings.generalPane.output',
    ])
    expect(screen.getByText('settings.generalPane.shortcutsHint')).toBeDefined()
  })

  it('lists every shortcut with its description, and Cancel as a read-only Esc', () => {
    render(<GeneralPane />)
    const shortcuts = screen.getByRole('region', { name: 'settings.hotkey' })

    for (const [label, description] of [
      ['home.shortcuts.dictate', 'home.shortcuts.dictateDesc'],
      // A new install has no translation language yet (plan `tutorial-one-page`).
      ['home.shortcuts.translate', 'home.shortcuts.translateDescNoLanguage'],
      ['settings.switchLanguageHotkey', 'settings.generalPane.switchLanguageDesc'],
      ['home.shortcuts.ask', 'settings.generalPane.askDesc'],
      ['settings.generalPane.cancel', 'settings.generalPane.cancelDesc'],
    ]) {
      expect(within(shortcuts).getByText(label)).toBeDefined()
      expect(within(shortcuts).getByText(description)).toBeDefined()
    }

    const cancel = screen.getByTestId('shortcut-cancel')
    // Plan `compact-key-labels`: the fixed Escape key is an "esc" cap read as "Escape".
    const esc = within(cancel).getByTitle('Escape')
    expect(esc.tagName).toBe('KBD')
    expect(esc.querySelector('[aria-hidden="true"]')?.textContent).toBe('esc')
    expect(within(cancel).getByText('Escape')).toHaveClass('sr-only')
    expect(within(cancel).queryByRole('button')).toBeNull()
  })

  it('reads as four blocks, with Switch language inside the Translate block', () => {
    render(<GeneralPane />)
    const shortcuts = screen.getByRole('region', { name: 'settings.hotkey' })

    const blocks = Array.from(shortcuts.querySelector('.row-group')!.children)
    expect(blocks).toHaveLength(4)
    expect(blocks[0]).toHaveAttribute('data-hotkey-role', 'dictation')
    expect(blocks[2]).toHaveAttribute('data-hotkey-role', 'ask')
    expect(blocks[3]).toHaveAttribute('data-testid', 'shortcut-cancel')

    // Translate and its switch key share one block; the hairline rules put a line above the
    // block and none between the row and its sub-row, which is no `.row`.
    const translate = within(shortcuts).getByText('home.shortcuts.translate').closest('.row')!
    expect(translate).toHaveAttribute('data-hotkey-role', 'translate')
    expect(translate.parentElement).toBe(blocks[1])
    expect(blocks[1]).toHaveClass('row-block')
    const sub = translate.nextElementSibling as HTMLElement
    expect(sub).toHaveClass('row-sub')
    expect(sub).not.toHaveClass('row')
    expect(within(sub).getByText('settings.switchLanguageHotkey')).toBeDefined()
    expect(sub.querySelector('[data-hotkey-role="switchLanguage"]')).not.toBeNull()
  })

  it('has no Switch language off macOS, so Translate is a plain row', () => {
    setPlatform('Win32')
    render(<GeneralPane />)
    const shortcuts = screen.getByRole('region', { name: 'settings.hotkey' })

    expect(within(shortcuts).queryByText('settings.switchLanguageHotkey')).toBeNull()
    expect(shortcuts.querySelector('[data-hotkey-role="switchLanguage"]')).toBeNull()
    expect(shortcuts.querySelector('.row-block, .row-sub')).toBeNull()
    const translate = shortcuts.querySelector('[data-hotkey-role="translate"]')!
    expect(translate.parentElement).toHaveClass('row-group')
  })

  it('names the Translate languages the switch key moves through, in list order', () => {
    useAppStore.getState().updateConfig({
      translation: { targets: ['en', 'ja', 'fr'], active_target: 'ja' },
    })
    render(<GeneralPane />)

    const sub = document.querySelector('.row-sub') as HTMLElement
    expect(within(sub).getByText('English → 日本語 → Français')).toHaveClass('text-text-tertiary')
  })

  it('leaves the language line out with fewer than two Translate languages', () => {
    useAppStore.getState().updateConfig({ translation: { targets: ['en'], active_target: 'en' } })
    render(<GeneralPane />)

    // Only the usual help line; no line with "English" alone.
    const sub = document.querySelector('.row-sub') as HTMLElement
    const help = Array.from(sub.querySelectorAll('.row-help')).map((line) => line.textContent)
    expect(help).toEqual(['settings.generalPane.switchLanguageDesc'])
  })

  it('draws shortcut keys as key caps inside the recorder field', () => {
    render(<GeneralPane />)

    const ask = document.querySelector('[data-hotkey-role="ask"]') as HTMLElement
    const field = within(ask).getByRole('button', { name: 'Fn + Space' })
    const caps = Array.from(field.querySelectorAll('kbd')).map((kbd) => kbd.textContent)
    expect(caps).toEqual(['Fn', 'Space'])
  })

  it('draws side-specific keys as a symbol with a small side letter (plan compact-key-labels)', () => {
    const hotkeys = config().hotkeys
    const translate = { primary: 'RightShift', modifiers: ['End'] }
    useAppStore.getState().updateConfig({
      hotkeys: { ...hotkeys, translate, translateBindings: [translate] },
    })
    render(<GeneralPane />)

    const row = document.querySelector('[data-hotkey-role="translate"]') as HTMLElement
    // The field reads full names; the caps show End and ⇧ with a small R.
    const field = within(row).getByRole('button', { name: 'End + Right Shift' })
    const caps = Array.from(field.querySelectorAll('kbd'))
    expect(caps.map((kbd) => kbd.getAttribute('title'))).toEqual(['End', 'Right Shift'])
    expect(caps[0].textContent).toBe('End')
    expect(caps[1].querySelector('.kbd-glyph')).toHaveTextContent('⇧')
    expect(caps[1].querySelector('.kbd-side')).toHaveTextContent('R')
  })

  it('keeps Try Ask and adding extra shortcuts', () => {
    render(<GeneralPane />)

    expect(screen.getByRole('button', { name: 'settings.tryAsk' })).toBeDefined()
    expect(screen.getAllByRole('button', { name: 'settings.shortcutAdd' })).toHaveLength(3)
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

  it('does not hold System settings (they live in Settings → System)', () => {
    render(<GeneralPane />)

    expect(screen.queryByText('settings.launchAtStartup')).toBeNull()
    expect(screen.queryByText('settings.showInDock')).toBeNull()
  })
})

describe('General pane strings', () => {
  it('exist in every locale with the same keys', () => {
    const enKeys = Object.keys(en.settings.generalPane).sort()
    expect(enKeys.length).toBeGreaterThan(0)
    expect(Object.keys(zh.settings.generalPane).sort()).toEqual(enKeys)
    for (const value of [
      ...Object.values(en.settings.generalPane),
      ...Object.values(zh.settings.generalPane),
    ]) {
      expect(value.trim()).not.toBe('')
    }
  })
})
