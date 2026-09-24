import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortcutStep } from '../ShortcutStep'
import { translationWithFirstTarget } from '../shortcutConfig'
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

/** Send a backend event, as Rust would. */
function emit(name: string, payload: unknown) {
  act(() => {
    for (const listener of listeners.get(name) ?? []) listener({ payload })
  })
}

/** The config passed to the last `updateConfig` call. */
function lastSaved() {
  const calls = vi.mocked(tauri.updateConfig).mock.calls
  return calls[calls.length - 1][0]
}

async function renderStep(role: ShortcutRole, onDone = vi.fn()) {
  const view = render(<ShortcutStep role={role} done={false} onDone={onDone} />)
  // Wait until the practice listeners are attached.
  await waitFor(() => expect(listeners.get('pipeline:insert_result')?.length).toBeGreaterThan(0))
  return { ...view, onDone }
}

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
    translation: { targets: ['en', 'zh', 'ja'], active_target: 'en' },
  })
})

afterEach(() => cleanup())

describe('ShortcutStep recording', () => {
  it('shows the current binding and refers to it in the instructions', async () => {
    await renderStep('dictation')

    expect(screen.getByRole('button', { name: 'Fn' })).toBeInTheDocument()
    expect(
      screen.getByText('Press Fn, say a sentence, then press Fn again. The text appears below.'),
    ).toBeInTheDocument()
    expect(tauri.resumeHotkey).toHaveBeenCalledTimes(1)
  })

  it('uses the translate and ask defaults on their steps', async () => {
    await renderStep('translate')
    expect(screen.getByRole('button', { name: 'Fn + Left Shift' })).toBeInTheDocument()
    cleanup()

    await renderStep('ask')
    expect(screen.getByRole('button', { name: 'Fn + Space' })).toBeInTheDocument()
  })

  it('records a new shortcut by pressing keys, saves it and makes it live', async () => {
    await renderStep('dictation')

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
    await renderStep('translate')

    fireEvent.click(screen.getByRole('button', { name: 'Fn + Left Shift' }))
    await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
    emit('hotkey:capture', { held: ['Fn'], finished: true, cancelled: false })

    expect(await screen.findByText(/already used|conflict/i)).toBeInTheDocument()
    expect(tauri.updateConfig).not.toHaveBeenCalled()
  })

  it('shows when the shortcuts could not be made live, with a retry', async () => {
    vi.mocked(tauri.resumeHotkey).mockRejectedValueOnce('event tap failed')
    await renderStep('dictation')

    expect(
      await screen.findByText('Shortcuts are not active: event tap failed'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(tauri.resumeHotkey).toHaveBeenCalledTimes(2))
  })
})

describe('ShortcutStep translate language', () => {
  it('writes the picked language as the active target and first slot', async () => {
    await renderStep('translate')

    fireEvent.change(screen.getByLabelText('Translate into'), { target: { value: 'fr' } })

    expect(useAppStore.getState().config.translation).toEqual({
      targets: ['fr', 'zh', 'ja'],
      active_target: 'fr',
    })
    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.active_target).toBe('fr')
  })

  it('keeps the other slots when the language was already one of them', () => {
    expect(
      translationWithFirstTarget({ targets: ['en', 'zh', 'ja'], active_target: 'zh' }, 'ja'),
    ).toEqual({ targets: ['ja', 'zh', 'en'], active_target: 'ja' })
    expect(translationWithFirstTarget({ targets: [], active_target: 'en' }, 'de')).toEqual({
      targets: ['de'],
      active_target: 'de',
    })
  })
})

describe('ShortcutStep completion', () => {
  it('completes Dictate when a dictation run pasted its text', async () => {
    const { onDone } = await renderStep('dictation')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'inserted' })

    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ignores runs of another mode', async () => {
    const { onDone } = await renderStep('dictation')

    emit('pipeline:voice_mode', 'translate')
    emit('pipeline:insert_result', { status: 'inserted' })

    expect(onDone).not.toHaveBeenCalled()
  })

  it('completes Translate only for a translate run', async () => {
    const { onDone } = await renderStep('translate')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'inserted' })
    expect(onDone).not.toHaveBeenCalled()

    emit('pipeline:voice_mode', 'translate')
    emit('pipeline:voice_mode', null)
    emit('pipeline:insert_result', { status: 'copiedFallback' })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('shows a failed paste or pipeline error and stays incomplete', async () => {
    const { onDone } = await renderStep('dictation')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'failed', message: 'paste blocked' })
    expect(await screen.findByText('That did not work (paste blocked). Try again.')).toBeVisible()

    emit('pipeline:error', { code: 'stt_connection_failed' })
    expect(await screen.findByText('That did not work (STT offline). Try again.')).toBeVisible()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('completes Ask when an answer arrives and shows it', async () => {
    const { onDone } = await renderStep('ask')

    emit('ask:result', { question: 'Capital of France?', answer: 'Paris.', output: 'popupAnswer' })

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Paris.')).toBeInTheDocument()
  })

  it('completes Ask when the answer was typed into the practice box', async () => {
    const { onDone } = await renderStep('ask')
    const box = screen.getByLabelText('Try it')

    fireEvent.change(box, { target: { value: 'typed by hand' } })
    expect(onDone).not.toHaveBeenCalled()

    emit('pipeline:state', 'ask_recording')
    emit('pipeline:state', 'ask_thinking')
    fireEvent.change(box, { target: { value: 'An answer pasted by Ask' } })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
