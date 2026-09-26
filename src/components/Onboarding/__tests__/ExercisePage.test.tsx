import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExercisePage } from '../ExercisePage'
import { EXERCISES } from '../exercises'
import type { ExerciseId } from '../exercises'
import type { ShortcutRole } from '../shortcutConfig'
import * as tauri from '../../../lib/tauri'
import { bindingFromHotkey, useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri', () => ({ resumeHotkey: vi.fn() }))

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

const sleep = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

/** Text content, whitespace collapsed (key caps are separate elements). */
const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

const ROLE_OF: Record<ExerciseId, ShortcutRole> = {
  correction: 'dictation',
  fillers: 'dictation',
  speakTranslate: 'translate',
  selectionTranslate: 'translate',
  question: 'ask',
  edit: 'ask',
}

async function renderExercise(id: ExerciseId, onPassed = vi.fn()) {
  const role = ROLE_OF[id]
  const exercise = EXERCISES[role].find((item) => item.id === id)!
  const view = render(<ExercisePage role={role} exercise={exercise} onPassed={onPassed} />)
  await waitFor(() => expect(listeners.get('pipeline:error')?.length).toBe(1))
  return { ...view, onPassed }
}

const box = () => screen.getByRole('textbox') as HTMLTextAreaElement
const line = () => screen.getByTestId('result-line')
const resultCard = () => screen.queryByTestId('result-card')
/** The instruction line above the top card. */
const instruction = () => document.querySelector('.flex.flex-col.gap-3 > p')

function paste(value: string) {
  fireEvent.change(box(), { target: { value } })
}

function setTargets(targets: string[], active = targets[0] ?? '') {
  useAppStore.getState().updateConfig({ translation: { targets, active_target: active } })
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  listeners.clear()
  vi.clearAllMocks()
  vi.mocked(tauri.resumeHotkey).mockResolvedValue(undefined)
  const end = bindingFromHotkey('End')!
  const fnShift = bindingFromHotkey('Fn+LeftShift')!
  const fnSpace = bindingFromHotkey('Fn+Space')!
  const hotkeys = useAppStore.getState().config.hotkeys
  useAppStore.getState().updateConfig({
    hotkeys: {
      ...hotkeys,
      dictation: end,
      dictationBindings: [end],
      translate: fnShift,
      translateBindings: [fnShift],
      ask: fnSpace,
      askBindings: [fnSpace],
      dictationMode: 'toggle',
      switchLanguage: bindingFromHotkey('Shift'),
    },
  })
  setTargets(['en'])
})

afterEach(() => cleanup())

describe('Exercise page states (plan tutorial-one-page)', () => {
  it('goes Ready → Listening → Writing → Success, and shows success only after the paste landed', async () => {
    const { onPassed } = await renderExercise('correction')

    // Ready: instruction with inline key caps, the line to read, an empty focused box.
    expect(text(instruction())).toBe('Press End, read the line, press End again.')
    expect(instruction()!.querySelectorAll('kbd')).toHaveLength(2)
    expect(screen.getByText('Read this')).toBeInTheDocument()
    expect(screen.getByText("Let's have lunch at 1… oh no, let's do it at 2.")).toBeInTheDocument()
    expect(document.activeElement).toBe(box())
    expect(box()).toHaveAttribute('placeholder', 'Your text appears here')
    expect(line()).toHaveAttribute('data-view', 'ready')
    expect(text(line())).toBe('')

    emit('pipeline:voice_mode', 'dictate')
    expect(line()).toHaveAttribute('data-view', 'listening')
    expect(text(line())).toBe('Listening… press End again when you finish.')

    emit('stt:final', "Let's have lunch at 1 oh no let's do it at 2")
    emit('pipeline:state', 'transcribing')
    expect(text(line())).toBe('Typelite is writing…')

    // The insert result arrives before the keystrokes reached the box: keep writing.
    const result = "Let's have lunch at 2."
    emit('pipeline:insert_result', { status: 'inserted', charsInserted: result.length })
    await sleep(250)
    expect(line()).toHaveAttribute('data-view', 'writing')
    expect(resultCard()).toBeNull()

    // Half of it typed: still writing.
    paste("Let's have lunch")
    await sleep(300)
    expect(line()).toHaveAttribute('data-view', 'writing')
    expect(onPassed).not.toHaveBeenCalled()

    // All of it: success once the box settled.
    paste(result)
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'success'))
    const card = resultCard()!
    expect(within(card).getByText('Only your correction was kept.')).toBeInTheDocument()
    expect(card.querySelector('del')).not.toBeNull()
    expect(text(card)).toContain("Let's have lunch")
    expect(box()).toHaveClass('tutorial-box-done')
    expect(screen.queryByText('Read this')).toBeNull()
    expect(onPassed).toHaveBeenCalledTimes(1)
  })

  it('shows "Not quite" for a run that kept "at 1", and Try again starts afresh', async () => {
    const { onPassed } = await renderExercise('correction')

    emit('pipeline:voice_mode', 'dictate')
    emit('stt:final', 'lunch at 1')
    paste("Let's have lunch at 1.")
    emit('pipeline:insert_result', { status: 'inserted', charsInserted: 22 })

    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'miss'))
    expect(text(line())).toBe('Not quite what we expected.Try again')
    expect(onPassed).not.toHaveBeenCalled()

    fireEvent.click(within(line()).getByRole('button', { name: 'Try again' }))
    expect(box()).toHaveValue('')
    expect(line()).toHaveAttribute('data-view', 'ready')
    await waitFor(() => expect(listeners.get('stt:final')?.length).toBe(1))
  })

  it('shows "Didn\'t catch that" when there was no speech', async () => {
    await renderExercise('fillers')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:error', { code: 'stt_no_speech_detected' })
    expect(line()).toHaveAttribute('data-view', 'noSpeech')
    expect(text(line())).toBe("Didn't catch that.Try again")
  })

  it('shows a failed paste, a paste held for Copy, and pipeline errors', async () => {
    await renderExercise('fillers')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'failed', message: 'paste blocked' })
    expect(text(line())).toBe('That did not work (paste blocked).Try again')

    emit('pipeline:voice_mode', 'dictate')
    emit('pipeline:insert_result', { status: 'heldForCopy', charsInserted: 0 })
    expect(text(line())).toContain('The text was not pasted into the box')

    emit('pipeline:error', { code: 'stt_connection_failed' })
    expect(text(line())).toBe('That did not work (STT offline).Try again')
  })

  it('ignores runs of another mode, and goes back to Ready when a recording is cancelled', async () => {
    await renderExercise('correction')

    emit('pipeline:voice_mode', 'translate')
    expect(line()).toHaveAttribute('data-view', 'ready')

    emit('pipeline:voice_mode', 'dictate')
    expect(line()).toHaveAttribute('data-view', 'listening')
    emit('pipeline:state', 'idle')
    expect(line()).toHaveAttribute('data-view', 'ready')
  })

  it('uses hold wording when Settings chose hold-to-talk', async () => {
    const hotkeys = useAppStore.getState().config.hotkeys
    useAppStore.getState().updateConfig({ hotkeys: { ...hotkeys, dictationMode: 'hold' } })
    await renderExercise('fillers')

    expect(text(instruction())).toBe('Hold End, read the line, then let go.')
    emit('pipeline:voice_mode', 'dictate')
    expect(text(line())).toBe('Listening… let go of End when you finish.')
  })
})

describe('Translate exercises', () => {
  it('shows the Start · Switch language · Stop legend and a Cantonese line for English', async () => {
    const { onPassed } = await renderExercise('speakTranslate')

    const legend = screen.getByTestId('translate-legend')
    expect(text(legend)).toBe('Fn + Left Shift Start·Shift (either side) Switch language·Fn Stop')
    // One language: switching is dimmed, with a tooltip.
    const switchItem = screen.getByTestId('legend-switch')
    expect(switchItem).toHaveClass('tutorial-legend-off')
    expect(switchItem).toHaveAttribute('title', 'Add a second language to switch')
    expect(
      screen.getByText('Say this in your own language, or anything you like'),
    ).toBeInTheDocument()
    expect(screen.getByText('早晨，我哋聽日下晝可唔可以見面？')).toBeInTheDocument()

    emit('pipeline:voice_mode', 'translate')
    expect(text(line())).toBe('Listening… press Fn to stop.')

    emit('stt:final', '早晨，我哋聽日下晝可唔可以見面？')
    const result = 'Good morning, can we meet tomorrow afternoon?'
    emit('pipeline:insert_result', { status: 'inserted', charsInserted: result.length })
    paste(result)
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'success'))
    expect(within(resultCard()!).getByText('Translated into English.')).toBeInTheDocument()
    expect(text(resultCard())).toContain('早晨，我哋聽日下晝可唔可以見面？→Good morning')
    expect(onPassed).toHaveBeenCalledTimes(1)
  })

  it('reads English for another first language and names the Switch key while listening', async () => {
    setTargets(['ja', 'en'], 'ja')
    await renderExercise('speakTranslate')

    expect(screen.getByText('Good morning, can we meet tomorrow afternoon?')).toBeInTheDocument()
    expect(screen.getByTestId('legend-switch')).not.toHaveClass('tutorial-legend-off')
    emit('pipeline:voice_mode', 'translate')
    expect(text(line())).toBe(
      'Listening… press Fn to stop, Shift (either side) to switch language.',
    )
  })

  it('dims Switch language when the key is off', async () => {
    setTargets(['ja', 'en'], 'ja')
    const hotkeys = useAppStore.getState().config.hotkeys
    useAppStore.getState().updateConfig({ hotkeys: { ...hotkeys, switchLanguage: null } })
    await renderExercise('speakTranslate')

    const switchItem = screen.getByTestId('legend-switch')
    expect(switchItem).toHaveClass('tutorial-legend-off')
    expect(switchItem).toHaveAttribute('title', 'Set a Switch language key in Settings')
    expect(text(switchItem)).toBe('— Switch language')
  })

  it('translates a highlighted text block in place', async () => {
    const { onPassed } = await renderExercise('selectionTranslate')

    const block = screen.getByRole('textbox', { name: 'Text to select' }) as HTMLTextAreaElement
    expect(block).toHaveClass('tutorial-box-block')
    expect(block).toHaveValue('今天下午三点开会')
    expect(document.activeElement).toBe(block)
    expect(block.selectionStart).toBe(0)
    expect(block.selectionEnd).toBe('今天下午三点开会'.length)
    expect(text(line())).toBe('The text above is highlighted for you.')
    expect(screen.getByText('What happens')).toBeInTheDocument()
    expect(
      screen.getByText('The highlighted text below is replaced by its English translation.'),
    ).toBeInTheDocument()
    expect(text(instruction())).toBe(
      'Keep the text highlighted, press Fn + Left Shift, then press Fn + Left Shift again without speaking.',
    )

    emit('pipeline:voice_mode', 'translate')
    const result = 'The meeting is at three this afternoon.'
    emit('pipeline:insert_result', { status: 'inserted', charsInserted: result.length })
    paste(result)
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'success'))
    expect(
      within(resultCard()!).getByText('Selection translated into English.'),
    ).toBeInTheDocument()
    expect(text(resultCard())).toContain('今天下午三点开会→The meeting')
    expect(onPassed).toHaveBeenCalledTimes(1)
  })

  it('pre-fills English for another first language, and fails an untranslated block', async () => {
    setTargets(['ja'])
    await renderExercise('selectionTranslate')

    expect(box()).toHaveValue('The meeting starts at three this afternoon.')
    emit('pipeline:voice_mode', 'translate')
    const same = 'The meeting starts at 3 this afternoon.'
    emit('pipeline:insert_result', { status: 'inserted', charsInserted: same.length })
    paste(same)
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'miss'))
  })
})

describe('Ask exercises', () => {
  it('asks a question with no box; the answer opens in the Ask window', async () => {
    const { onPassed } = await renderExercise('question')

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(text(instruction())).toBe('Press Fn + Space, read the line, press Fn + Space again.')
    emit('pipeline:state', 'ask_recording')
    expect(text(line())).toBe('Listening… press Fn + Space again when you finish.')
    emit('ask:final', 'What is fifteen percent of two hundred forty?')
    emit('pipeline:state', 'ask_thinking')
    expect(text(line())).toBe('Thinking…')
    emit('ask:result', {
      question: 'What is 15% of 240?',
      answer: '15% of 240 is 36.',
      output: 'popupAnswer',
    })

    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'success'))
    expect(within(resultCard()!).getByText('Answered in the Ask window.')).toBeInTheDocument()
    expect(text(resultCard())).toContain('What is 15% of 240?→15% of 240 is 36.')
    expect(onPassed).toHaveBeenCalledTimes(1)
  })

  it('waits for an in-place edit to reach the block before deciding', async () => {
    const { onPassed } = await renderExercise('edit')
    const prefill =
      'Hey, just checking whether you had a chance to look at the draft I sent over last week, no rush at all.'
    expect(box()).toHaveValue(prefill)
    expect(screen.getByText('Then say')).toBeInTheDocument()

    emit('pipeline:state', 'ask_recording')
    emit('ask:final', 'Make this shorter.')
    emit('pipeline:state', 'ask_thinking')
    emit('ask:result', { question: 'Make this shorter.', answer: '', output: 'insertedText' })
    await sleep(250)
    expect(line()).toHaveAttribute('data-view', 'writing')

    paste('Did you get a chance to look at my draft? No rush.')
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'success'))
    expect(within(resultCard()!).getByText('Rewritten shorter.')).toBeInTheDocument()
    expect(onPassed).toHaveBeenCalledTimes(1)
  })

  it('does not pass an edit that made the text longer', async () => {
    await renderExercise('edit')

    emit('pipeline:state', 'ask_recording')
    emit('pipeline:state', 'ask_thinking')
    emit('ask:result', {
      question: 'Make this shorter.',
      answer: `${box().value} Thanks a lot, really appreciate it!`,
      output: 'popupAnswer',
    })
    await waitFor(() => expect(line()).toHaveAttribute('data-view', 'miss'))
  })
})
