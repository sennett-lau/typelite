import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortcutSetupPage } from '../ShortcutSetupPage'
import { translationWithTarget, translationWithoutTarget } from '../shortcutConfig'
import type { ShortcutRole } from '../shortcutConfig'
import * as tauri from '../../../lib/tauri'
import { bindingFromHotkey, useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/tauri')>()
  return {
    SHORTCUT_CAPTURE_EVENT: actual.SHORTCUT_CAPTURE_EVENT,
    updateConfig: vi.fn(),
    resumeHotkey: vi.fn(),
    pauseHotkey: vi.fn(),
    startShortcutCapture: vi.fn(),
    stopShortcutCapture: vi.fn(),
  }
})

type Listener = (event: { payload: unknown }) => void
const listeners = new Map<string, Listener[]>()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: Listener) => {
    listeners.set(name, [...(listeners.get(name) ?? []), handler])
    return () => {
      listeners.set(
        name,
        (listeners.get(name) ?? []).filter((listener) => listener !== handler),
      )
    }
  }),
}))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

function emit(name: string, payload: unknown) {
  act(() => {
    for (const listener of listeners.get(name) ?? []) listener({ payload })
  })
}

function lastSaved() {
  const calls = vi.mocked(tauri.updateConfig).mock.calls
  return calls[calls.length - 1][0]
}

function setTargets(targets: string[], active = targets[0] ?? '') {
  useAppStore.getState().updateConfig({ translation: { targets, active_target: active } })
}

async function renderPage(role: ShortcutRole) {
  const view = render(<ShortcutSetupPage role={role} />)
  await waitFor(() => expect(tauri.resumeHotkey).toHaveBeenCalled())
  return view
}

/** Text content of an element, whitespace collapsed (key caps are separate elements). */
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim()

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  listeners.clear()
  vi.clearAllMocks()
  Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.resumeHotkey).mockResolvedValue(undefined)
  vi.mocked(tauri.pauseHotkey).mockResolvedValue(undefined)
  vi.mocked(tauri.startShortcutCapture).mockResolvedValue(undefined)
  vi.mocked(tauri.stopShortcutCapture).mockResolvedValue(undefined)
  // A fresh macOS install: the Typeless-style Fn defaults.
  const fn = bindingFromHotkey('Fn')!
  const fnShift = bindingFromHotkey('Fn+LeftShift')!
  const fnSpace = bindingFromHotkey('Fn+Space')!
  const hotkeys = useAppStore.getState().config.hotkeys
  useAppStore.getState().updateConfig({
    hotkeys: {
      ...hotkeys,
      dictation: fn,
      dictationBindings: [fn],
      translate: fnShift,
      translateBindings: [fnShift],
      ask: fnSpace,
      askBindings: [fnSpace],
      dictationMode: 'toggle',
    },
  })
})

afterEach(() => cleanup())

describe('ShortcutSetupPage keys (plan tutorial-one-page)', () => {
  it('shows the shortcut as large key caps and the press-to-start hint', async () => {
    await renderPage('dictation')

    const field = screen.getByRole('button', { name: 'Fn' })
    expect(field).toHaveClass('keycap-field')
    expect(
      Array.from(field.querySelectorAll('kbd.kbd-large')).map((kbd) => kbd.textContent),
    ).toEqual(['Fn'])
    expect(
      screen.getByText(
        /Press to start, press again to stop\. Click the keys to choose different ones\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Next: 2 short exercises to try it.')).toBeInTheDocument()
    // No recording-mode choice on the setup page.
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('names the stop key on the Translate page and "send" on the Ask page', async () => {
    await renderPage('translate')
    const field = screen.getByRole('button', { name: 'Fn + Left Shift' })
    expect(Array.from(field.querySelectorAll('kbd')).map((kbd) => kbd.textContent)).toEqual([
      'Fn',
      'Left Shift',
    ])
    const hint = screen.getByText(/Press to start\. While recording,/)
    expect(text(hint)).toBe(
      'Press to start. While recording, Fn stops. Click the keys to choose different ones.',
    )
    expect(within(hint).getByText('Fn').tagName).toBe('KBD')
    cleanup()

    await renderPage('ask')
    expect(screen.getByRole('button', { name: 'Fn + Space' })).toBeInTheDocument()
    expect(screen.getByText(/Press to start, press again to send\./)).toBeInTheDocument()
  })

  it('records a new shortcut by pressing keys, saves it and makes it live', async () => {
    await renderPage('dictation')

    fireEvent.click(screen.getByRole('button', { name: 'Fn' }))
    await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
    emit('hotkey:capture', { held: ['End'], finished: true, cancelled: false })

    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    const saved = lastSaved()
    expect(saved.hotkeys.dictation).toEqual({ primary: 'End', modifiers: [] })
    expect(saved.hotkeys.dictationBindings).toEqual([{ primary: 'End', modifiers: [] }])
    expect(saved.hotkey).toBe('End')
    await waitFor(() => expect(tauri.resumeHotkey).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument()
  })

  it('refuses a shortcut that another role already uses', async () => {
    await renderPage('translate')

    fireEvent.click(screen.getByRole('button', { name: 'Fn + Left Shift' }))
    await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
    emit('hotkey:capture', { held: ['Fn'], finished: true, cancelled: false })

    expect(await screen.findByText(/already used|conflict/i)).toBeInTheDocument()
    expect(tauri.updateConfig).not.toHaveBeenCalled()
  })

  it('shows when the shortcuts could not be made live, with a retry', async () => {
    vi.mocked(tauri.resumeHotkey).mockRejectedValueOnce('event tap failed')
    await renderPage('dictation')

    expect(
      await screen.findByText('Shortcuts are not active: event tap failed'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(tauri.resumeHotkey).toHaveBeenCalledTimes(2))
  })
})

describe('Translate languages and pill preview (plan tutorial-one-page)', () => {
  const slots = () => screen.getByRole('list', { name: 'Translate into' })
  const caption = () =>
    screen.getByText(
      (_, element) =>
        element?.tagName === 'P' && /pill|switch language/.test(element.textContent ?? ''),
    )

  it('starts with no language: three slots, "+ Add" first, the pill without a name', async () => {
    setTargets([])
    await renderPage('translate')

    expect(screen.getByText('0 of 3')).toBeInTheDocument()
    // Only the add slot is a list item; the other two are faint placeholders.
    expect(within(slots()).getAllByRole('listitem')).toHaveLength(1)
    expect(within(slots()).getByRole('combobox', { name: 'Add a language' })).toBeInTheDocument()
    expect(slots().querySelectorAll('.lang-slot-empty')).toHaveLength(2)
    expect(screen.getByRole('group', { name: 'Recording pill preview' })).toBeInTheDocument()
    expect(document.querySelector('.pill-preview .pill-lang-name')).toBeNull()
    expect(text(caption())).toBe('Add a language, and the pill will show it while you record.')
  })

  it('adds languages in order, numbers them from two, and saves each change', async () => {
    setTargets([])
    await renderPage('translate')

    fireEvent.change(screen.getByRole('combobox', { name: 'Add a language' }), {
      target: { value: 'ja' },
    })
    expect(useAppStore.getState().config.translation).toMatchObject({
      targets: ['ja'],
      active_target: 'ja',
    })
    await waitFor(() => expect(lastSaved().translation.targets).toEqual(['ja']))
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(slots().querySelector('.lang-slot-number')).toBeNull()
    expect(
      screen.getByRole('group', { name: 'Recording pill preview: 日本語' }),
    ).toBeInTheDocument()
    expect(text(caption())).toBe('While recording, the pill shows the language.')

    fireEvent.change(screen.getByRole('combobox', { name: 'Add a language' }), {
      target: { value: 'en' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a language' }), {
      target: { value: 'fr' },
    })
    expect(useAppStore.getState().config.translation).toMatchObject({
      targets: ['ja', 'en', 'fr'],
      active_target: 'ja',
    })
    expect(
      Array.from(slots().querySelectorAll('.lang-slot-number')).map((node) => node.textContent),
    ).toEqual(['1', '2', '3'])
    // No add slot at three.
    expect(screen.queryByRole('combobox', { name: 'Add a language' })).toBeNull()
    expect(document.querySelectorAll('.pill-preview .pill-lang-dots i')).toHaveLength(3)
  })

  it('removes a language; removing the active one makes the first remaining one active', async () => {
    setTargets(['en', 'ja'], 'en')
    await renderPage('translate')

    fireEvent.click(screen.getByRole('button', { name: 'Remove English' }))
    expect(useAppStore.getState().config.translation).toMatchObject({
      targets: ['ja'],
      active_target: 'ja',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove 日本語' }))
    expect(useAppStore.getState().config.translation).toMatchObject({
      targets: [],
      active_target: '',
    })
    await waitFor(() => expect(lastSaved().translation.targets).toEqual([]))
    expect(screen.getByRole('combobox', { name: 'Add a language' })).toBeInTheDocument()
  })

  it('grows with the name up to 180 pt, then scrolls a longer name as a marquee', async () => {
    setTargets(['en'])
    await renderPage('translate')
    const short = document.querySelector('.pill-preview .pill-lang-name') as HTMLElement
    expect(short).toHaveAttribute('data-display', 'full')
    expect(short.style.width).not.toBe('180px')
    cleanup()

    setTargets(['zh-Hant-HK'])
    await renderPage('translate')
    const long = document.querySelector('.pill-preview .pill-lang-name') as HTMLElement
    expect(long).toHaveAttribute('data-display', 'marquee')
    expect(long.style.width).toBe('180px')
    expect(long.querySelectorAll('.pill-lang-marquee-track > span')).toHaveLength(2)
  })

  it('explains switching with the Switch language key, or by clicking the name', async () => {
    setTargets(['en', 'ja'], 'en')
    await renderPage('translate')

    const switchCaption = caption()
    expect(text(switchCaption)).toBe(
      'While recording, press Shift (either side) or click the name to switch language.',
    )
    expect(within(switchCaption).getByText('Shift (either side)').tagName).toBe('KBD')

    // Clicking the name switches the preview's language, like the real pill.
    const name = screen.getByRole('button', { name: 'English' })
    expect(document.querySelector('.pill-preview .pill-lang-dots i.pill-lang-dot-on')).toBe(
      document.querySelectorAll('.pill-preview .pill-lang-dots i')[0],
    )
    fireEvent.click(name)
    expect(screen.getByRole('button', { name: '日本語' })).toBeInTheDocument()
    expect(document.querySelector('.pill-preview .pill-lang-dots i.pill-lang-dot-on')).toBe(
      document.querySelectorAll('.pill-preview .pill-lang-dots i')[1],
    )
    cleanup()

    const hotkeys = useAppStore.getState().config.hotkeys
    useAppStore.getState().updateConfig({ hotkeys: { ...hotkeys, switchLanguage: null } })
    await renderPage('translate')
    expect(text(caption())).toBe('Click the name on the pill to switch language.')
  })
})

describe('translation list helpers', () => {
  it('adds in the next slot, never a fourth or a duplicate', () => {
    const empty = { targets: [], active_target: '' }
    expect(translationWithTarget(empty, 'de')).toEqual({ targets: ['de'], active_target: 'de' })
    const one = { targets: ['de'], active_target: 'de' }
    expect(translationWithTarget(one, 'de')).toBe(one)
    expect(translationWithTarget(one, 'ja')).toEqual({ targets: ['de', 'ja'], active_target: 'de' })
    const full = { targets: ['de', 'ja', 'en'], active_target: 'ja' }
    expect(translationWithTarget(full, 'fr')).toBe(full)
  })

  it('removes, moving the active language to the first remaining one', () => {
    const three = { targets: ['de', 'ja', 'en'], active_target: 'ja' }
    expect(translationWithoutTarget(three, 'ja')).toEqual({
      targets: ['de', 'en'],
      active_target: 'de',
    })
    expect(translationWithoutTarget(three, 'en')).toEqual({
      targets: ['de', 'ja'],
      active_target: 'ja',
    })
    expect(translationWithoutTarget({ targets: ['de'], active_target: 'de' }, 'de')).toEqual({
      targets: [],
      active_target: '',
    })
  })
})
