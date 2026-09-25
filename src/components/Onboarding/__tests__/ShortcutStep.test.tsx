import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  await waitFor(() => expect(listeners.get('pipeline:error')?.length).toBeGreaterThan(0))
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
    translation: { targets: ['en'], active_target: 'en' },
  })
})

afterEach(() => cleanup())

describe('ShortcutStep recording', () => {
  it('shows the current binding and refers to it in the instructions', async () => {
    await renderStep('dictation')

    expect(screen.getByRole('button', { name: 'Fn' })).toBeInTheDocument()
    expect(
      screen.getByText('Press Fn, read the line below, then press Fn again.'),
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
  it('preselects English and writes the picked language as the one target and default', async () => {
    await renderStep('translate')

    expect(screen.getByLabelText('Translate into')).toHaveValue('en')
    fireEvent.change(screen.getByLabelText('Translate into'), { target: { value: 'fr' } })

    expect(useAppStore.getState().config.translation).toEqual({
      targets: ['fr'],
      active_target: 'fr',
      languages: {},
    })
    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.active_target).toBe('fr')
  })

  it('keeps the other slots when the language was already one of them', () => {
    expect(
      translationWithFirstTarget(
        { targets: ['en', 'zh-Hans', 'ja'], active_target: 'zh-Hans' },
        'ja',
      ),
    ).toEqual({ targets: ['ja', 'zh-Hans', 'en'], active_target: 'ja' })
    expect(translationWithFirstTarget({ targets: [], active_target: 'en' }, 'de')).toEqual({
      targets: ['de'],
      active_target: 'de',
    })
  })
})

/** The practice box of the current exercise card. */
const box = () => screen.getByLabelText('Try it') as HTMLTextAreaElement

/** A Dictate or Translate run: the transcript, the paste into the box, then the result. */
function speakRun(mode: 'dictate' | 'translate', said: string | null, pastedBox: string) {
  emit('pipeline:voice_mode', mode)
  if (said !== null) emit('stt:final', said)
  fireEvent.change(box(), { target: { value: pastedBox } })
  emit('pipeline:insert_result', { status: 'inserted' })
  emit('pipeline:voice_mode', null)
}

function beforeAfter() {
  return screen.queryByTestId('before-after')
}

describe('Dictate exercises', () => {
  it('shows the script with the current binding and the before/after of a passing run', async () => {
    const end = bindingFromHotkey('End')!
    const hotkeys = useAppStore.getState().config.hotkeys
    useAppStore
      .getState()
      .updateConfig({ hotkeys: { ...hotkeys, dictation: end, dictationBindings: [end] } })
    const { onDone } = await renderStep('dictation')

    expect(screen.getByText('Exercise 1 of 2: Change of mind')).toBeInTheDocument()
    expect(screen.getByText('Press End, read the line below, then press End again.')).toBeVisible()
    expect(screen.getByText("Let's have lunch at 1… oh no, let's do it at 2.")).toBeVisible()
    expect(beforeAfter()).toBeNull()
    expect(document.activeElement).toBe(box())

    speakRun('dictate', "Let's have lunch at 1 oh no let's do it at 2", "Let's have lunch at 2.")

    expect(
      within(beforeAfter()!).getByText("Let's have lunch at 1 oh no let's do it at 2"),
    ).toBeVisible()
    expect(within(beforeAfter()!).getByText("Let's have lunch at 2.")).toBeVisible()
    expect(screen.getByText('Typelite kept only your correction.')).toBeVisible()
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Next exercise' }))
    expect(screen.getByText('Exercise 2 of 2: Fillers')).toBeInTheDocument()
    expect(beforeAfter()).toBeNull()
    expect(box()).toHaveValue('')
    await waitFor(() => expect(listeners.get('stt:final')?.length).toBe(1))

    speakRun(
      'dictate',
      'Um so I think we should like ship it on Friday',
      'I think we should ship it on Friday.',
    )
    expect(screen.getByText('Fillers like um and like are removed.')).toBeVisible()
    expect(onDone).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Finish exercises' }))
    expect(screen.getByText('All exercises finished')).toBeInTheDocument()
    expect(screen.getByText('Dictation works.')).toBeVisible()
  })

  it('shows a miss for a run that kept "at 1", and Try again resets the card', async () => {
    const { onDone } = await renderStep('dictation')

    speakRun('dictate', 'lunch at 1', "Let's have lunch at 1.")
    expect(
      await screen.findByText(
        "That doesn't look like the expected result yet. Try again, or skip this exercise.",
      ),
    ).toBeVisible()
    expect(onDone).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(box()).toHaveValue('')
    expect(beforeAfter()).toBeNull()
    expect(screen.queryByText(/expected result/)).toBeNull()
  })

  it('ignores runs of another mode', async () => {
    await renderStep('dictation')

    speakRun('translate', 'lunch at 2', "Let's have lunch at 2.")
    expect(screen.queryByText('Typelite kept only your correction.')).toBeNull()
  })

  it('completes the step when every exercise is skipped', async () => {
    const { onDone } = await renderStep('dictation')

    fireEvent.click(screen.getByRole('button', { name: 'Skip this exercise' }))
    expect(screen.getByText('Exercise 2 of 2: Fillers')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Skip this exercise' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getAllByLabelText('Skipped')).toHaveLength(2)
  })

  it('shows a failed paste or pipeline error', async () => {
    await renderStep('dictation')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'failed', message: 'paste blocked' })
    expect(await screen.findByText('That did not work (paste blocked). Try again.')).toBeVisible()

    emit('pipeline:error', { code: 'stt_connection_failed' })
    expect(await screen.findByText('That did not work (STT offline). Try again.')).toBeVisible()
  })

  it('forgets the before/after when the step changes', async () => {
    const view = render(
      <ShortcutStep key="dictation" role="dictation" done={false} onDone={vi.fn()} />,
    )
    await waitFor(() => expect(listeners.get('stt:final')?.length).toBe(1))
    speakRun('dictate', 'lunch at 2', "Let's have lunch at 2.")
    expect(beforeAfter()).not.toBeNull()

    view.rerender(<ShortcutStep key="translate" role="translate" done={false} onDone={vi.fn()} />)
    expect(beforeAfter()).toBeNull()
    view.rerender(<ShortcutStep key="dictation" role="dictation" done={false} onDone={vi.fn()} />)
    expect(beforeAfter()).toBeNull()
    expect(box()).toHaveValue('')
    expect(screen.queryByText('lunch at 2')).toBeNull()
  })
})

describe('Translate exercises', () => {
  it('translates speech, then a pre-selected sentence in another language', async () => {
    const { onDone } = await renderStep('translate')

    expect(screen.getByText('Good morning, can we meet tomorrow afternoon?')).toBeVisible()
    speakRun(
      'translate',
      '早上好，我们明天下午可以见面吗？',
      'Good morning, can we meet tomorrow afternoon?',
    )
    expect(screen.getByText('Typelite wrote it in English.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next exercise' }))
    expect(box()).toHaveValue('今天下午三点开会')
    expect(document.activeElement).toBe(box())
    expect(box().selectionStart).toBe(0)
    expect(box().selectionEnd).toBe('今天下午三点开会'.length)
    await waitFor(() => expect(listeners.get('stt:final')?.length).toBe(1))

    // No speech: the selection itself is translated and replaced.
    speakRun('translate', null, 'The meeting is at three this afternoon.')
    expect(within(beforeAfter()!).getByText('Nothing (no speech this time)')).toBeVisible()
    expect(screen.getByText('The selection was replaced by its English translation.')).toBeVisible()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('pre-fills English for a non-English target and fails an untranslated box', async () => {
    useAppStore.getState().updateConfig({ translation: { targets: ['ja'], active_target: 'ja' } })
    await renderStep('translate')
    fireEvent.click(screen.getByRole('button', { name: 'Skip this exercise' }))

    expect(box()).toHaveValue('The meeting starts at three this afternoon.')
    await waitFor(() => expect(listeners.get('stt:final')?.length).toBe(1))
    speakRun('translate', null, 'The meeting starts at 3 this afternoon.')
    expect(await screen.findByText(/expected result/)).toBeVisible()
  })

  it('shows the Switch language key with two or more languages', async () => {
    await renderStep('translate')
    expect(screen.queryByText(/While recording, press/)).toBeNull()
    cleanup()

    useAppStore
      .getState()
      .updateConfig({ translation: { targets: ['en', 'ja'], active_target: 'en' } })
    await renderStep('translate')
    expect(screen.getByText(/You chose 2 languages\. While recording, press/)).toBeVisible()
  })
})

describe('Ask exercises', () => {
  it('answers a question, then shortens a pre-selected sentence', async () => {
    const { onDone } = await renderStep('ask')

    expect(screen.getByText('What is fifteen percent of two hundred forty?')).toBeVisible()
    emit('pipeline:state', 'ask_recording')
    emit('ask:final', 'What is fifteen percent of two hundred forty?')
    emit('pipeline:state', 'ask_thinking')
    emit('ask:result', {
      question: 'What is 15% of 240?',
      answer: '15% of 240 is 36.',
      output: 'popupAnswer',
    })
    expect(within(beforeAfter()!).getByText('What is 15% of 240?')).toBeVisible()
    expect(within(beforeAfter()!).getByText('15% of 240 is 36.')).toBeVisible()
    expect(screen.getByText('Typelite answered: 15% of 240 is 36.')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Next exercise' }))
    const prefill =
      'Hey, just checking whether you had a chance to look at the draft I sent over last week, no rush at all.'
    expect(box()).toHaveValue(prefill)
    expect(box().selectionEnd).toBe(prefill.length)
    await waitFor(() => expect(listeners.get('ask:result')?.length).toBe(1))

    emit('pipeline:state', 'ask_recording')
    emit('ask:final', 'Make this shorter.')
    emit('pipeline:state', 'ask_thinking')
    emit('ask:result', {
      question: 'Make this shorter.',
      answer: 'Did you get a chance to look at my draft?',
      output: 'popupAnswer',
    })
    expect(screen.getByText('Typelite wrote a shorter version of your selection.')).toBeVisible()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('counts an answer typed into the box, but not typing by hand', async () => {
    await renderStep('ask')

    fireEvent.change(box(), { target: { value: 'typed by hand' } })
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(screen.queryByText(/Typelite answered/)).toBeNull()

    emit('pipeline:state', 'ask_recording')
    emit('pipeline:state', 'ask_thinking')
    fireEvent.change(box(), { target: { value: 'typed by hand 36' } })
    expect(screen.getByText('Typelite answered: 15% of 240 is 36.')).toBeVisible()
  })

  it('does not pass an edit that made the text longer', async () => {
    await renderStep('ask')
    fireEvent.click(screen.getByRole('button', { name: 'Skip this exercise' }))
    await waitFor(() => expect(listeners.get('ask:result')?.length).toBe(1))

    emit('pipeline:state', 'ask_recording')
    emit('pipeline:state', 'ask_thinking')
    emit('ask:result', {
      question: 'Make this shorter.',
      answer: `${box().value} Thanks a lot, really appreciate it!`,
      output: 'popupAnswer',
    })
    expect(await screen.findByText(/expected result/)).toBeVisible()
  })
})
