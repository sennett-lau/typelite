import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { AskPanel } from '../AskPanel'
import {
  abortAskDictation,
  answerAskAnyway,
  closeAskPanel,
  copyAskText,
  resizeAskPanel,
  startAskDictation,
  stopAskDictation,
  takePendingAskMessage,
} from '../../../lib/tauri'
import type { AskDictationResult } from '../../../lib/tauri'

const tauriEventMock = vi.hoisted(() => {
  type Listener = (event: { payload: unknown }) => void
  const listeners = new Map<string, Listener[]>()
  return {
    listeners,
    listen: vi.fn((event: string, callback: Listener) => {
      const current = listeners.get(event) ?? []
      current.push(callback)
      listeners.set(event, current)
      return Promise.resolve(() => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((listener) => listener !== callback),
        )
      })
    }),
    emit(event: string, payload?: unknown) {
      for (const listener of listeners.get(event) ?? []) {
        listener({ payload })
      }
    },
  }
})

vi.mock('../../../lib/tauri', () => ({
  ASK_PANEL_CLOSED_EVENT: 'ask:panel_closed',
  closeAskPanel: vi.fn(),
  resizeAskPanel: vi.fn(),
  copyAskText: vi.fn(),
  insertAskText: vi.fn(),
  answerAskAnyway: vi.fn(),
  startAskDictation: vi.fn(),
  stopAskDictation: vi.fn(),
  abortAskDictation: vi.fn(),
  takePendingAskMessage: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriEventMock.listen,
}))

async function flushAsyncEffects() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function askResult(
  overrides: Partial<Awaited<ReturnType<typeof stopAskDictation>>> = {},
): AskDictationResult {
  return {
    question: 'What is Typelite?',
    answer: 'It turns speech into useful text.',
    intent: 'open_question' as const,
    output: 'popupAnswer' as const,
    usedSelectedText: false,
    selectedTextTruncated: false,
    searchProvider: null,
    requestedPlacement: 'popup_answer' as const,
    actualPlacement: 'popup_answer' as const,
    fallbackReason: null,
    mayBeOutOfDate: false,
    ...overrides,
  }
}

function recordingStarted(overrides: Partial<Awaited<ReturnType<typeof startAskDictation>>> = {}) {
  return {
    usedSelectedText: false,
    selectedTextTruncated: false,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  tauriEventMock.listeners.clear()
})

describe('AskPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    vi.mocked(startAskDictation).mockResolvedValue(recordingStarted())
    vi.mocked(stopAskDictation).mockResolvedValue(askResult())
    vi.mocked(abortAskDictation).mockResolvedValue(undefined)
    vi.mocked(takePendingAskMessage).mockResolvedValue(null)
    vi.mocked(closeAskPanel).mockResolvedValue(undefined)
    vi.mocked(resizeAskPanel).mockResolvedValue(undefined)
    vi.mocked(copyAskText).mockResolvedValue(undefined)
  })

  async function emitWhenListening(event: string, payload: unknown) {
    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith(event, expect.any(Function))
    })
    act(() => tauriEventMock.emit(event, payload))
  }

  it('renders nothing in the standalone window until a result arrives', async () => {
    render(<AskPanel />)
    await flushAsyncEffects()

    expect(screen.getByTestId('ask-floating-note-backdrop')).toBeDefined()
    expect(screen.queryByTestId('ask-floating-note')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Record question' })).toBeNull()
    expect(screen.queryByText('Ready to ask')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders the hotkey result with question and answer popup content', async () => {
    render(<AskPanel />)

    expect(screen.queryByRole('textbox')).toBeNull()

    await waitFor(() => {
      expect(tauriEventMock.listen).toHaveBeenCalledWith('ask:result', expect.any(Function))
    })
    expect(tauriEventMock.listen).not.toHaveBeenCalledWith(
      'ask:recording-started',
      expect.any(Function),
    )
    act(() => tauriEventMock.emit('ask:result', askResult()))

    await waitFor(() => {
      expect(screen.getByText('What is Typelite?')).toBeDefined()
      expect(screen.getByText('It turns speech into useful text.')).toBeDefined()
    })
    expect(screen.getByTestId('ask-floating-note')).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Insert at the cursor' })).toBeDefined()
    expect(screen.queryByText('Answer')).toBeNull()
    expect(startAskDictation).not.toHaveBeenCalled()
  })

  it('says the result is on the clipboard when it could not be inserted', async () => {
    render(<AskPanel />)

    await emitWhenListening(
      'ask:result',
      askResult({
        question: 'draft a launch note',
        answer: 'Launch note',
        intent: 'draft_insert',
        output: 'copiedFallback',
        requestedPlacement: 'insert_at_cursor',
        actualPlacement: null,
        fallbackReason: 'target_changed',
      }),
    )

    expect(
      await screen.findByText(
        "This app didn't allow the replacement. The result is on your clipboard.",
      ),
    ).toBeDefined()
    expect(screen.getByText('Launch note')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Try replacing again' })).toBeDefined()
    expect(screen.queryByText(/confidence/i)).toBeNull()
    expect(screen.queryByText(/grammar/i)).toBeNull()
  })

  it('shows provider-only search status and never renders query URL or debug metadata', async () => {
    render(<AskPanel />)

    await emitWhenListening('ask:result', {
      ...askResult({
        question: 'search private launch plan on Google',
        answer: 'Opened Google search.',
        intent: 'search',
        output: 'openedSearch',
        requestedPlacement: 'open_url',
        actualPlacement: 'open_url',
        fallbackReason: null,
        searchProvider: 'Google',
      }),
      query: 'private launch plan',
      searchUrl: 'https://www.google.com/search?q=private+launch+plan',
      confidence: 1,
      grammarLocale: 'en',
    })

    expect(await screen.findByText('Opened Google search.')).toBeDefined()
    expect(screen.queryByText(/private launch plan/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByText(/google\.com/i)).toBeNull()
    expect(screen.queryByText(/^en$/i)).toBeNull()
  })

  it('prefixes the question when the highlight was used', async () => {
    render(<AskPanel />)

    await emitWhenListening('ask:result', askResult({ usedSelectedText: true }))

    const question = await screen.findByTestId('ask-panel-question')
    expect(question.textContent).toBe('About the highlight · What is Typelite?')
    expect(screen.getByRole('button', { name: 'Replace the highlight' })).toBeDefined()
  })

  it('closes the panel through the app from its close button', async () => {
    render(<AskPanel />)
    await emitWhenListening('ask:result', askResult())

    fireEvent.click(await screen.findByRole('button', { name: 'Close (Esc)' }))

    await waitFor(() => expect(closeAskPanel).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('ask-floating-note')).toBeNull()
    expect(abortAskDictation).not.toHaveBeenCalled()
  })

  it('drops its content when the app closes the panel (Escape or a new run)', async () => {
    render(<AskPanel />)
    await emitWhenListening('ask:result', askResult())
    expect(await screen.findByTestId('ask-floating-note')).toBeDefined()

    await emitWhenListening('ask:panel_closed', null)

    await waitFor(() => expect(screen.queryByTestId('ask-floating-note')).toBeNull())
    // The app already closed it; the page does not ask again.
    expect(closeAskPanel).not.toHaveBeenCalled()
  })

  it('ignores stale global Ask recording metadata in the standalone note', async () => {
    render(<AskPanel />)

    await waitFor(() => expect(tauriEventMock.listen).toHaveBeenCalled())
    await act(async () => {
      tauriEventMock.emit('ask:recording-started', recordingStarted({ usedSelectedText: true }))
    })

    await flushAsyncEffects()
    expect(screen.queryByText('Using selected text')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop and ask' })).toBeNull()
    expect(startAskDictation).not.toHaveBeenCalled()
  })

  it('copies the hotkey answer through the app', async () => {
    render(<AskPanel />)

    await emitWhenListening('ask:result', askResult())

    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(copyAskText).toHaveBeenCalledWith('It turns speech into useful text.')
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeDefined()
    })
  })

  it('renders a pending hotkey result when the native event was missed', async () => {
    vi.mocked(takePendingAskMessage).mockResolvedValueOnce({
      kind: 'result',
      payload: askResult(),
    })

    render(<AskPanel />)

    await waitFor(() => {
      expect(screen.getByText('It turns speech into useful text.')).toBeDefined()
    })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined()
    expect(startAskDictation).not.toHaveBeenCalled()
  })

  it('ignores pending global Ask recording metadata when the native event was missed', async () => {
    vi.mocked(takePendingAskMessage).mockResolvedValueOnce({
      kind: 'recordingStarted',
      payload: recordingStarted({ usedSelectedText: true, selectedTextTruncated: true }),
    })

    render(<AskPanel />)
    await flushAsyncEffects()

    expect(screen.queryByText('Using selected text (truncated)')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Stop and ask' })).toBeNull()
    expect(startAskDictation).not.toHaveBeenCalled()
  })

  it('does not let the embedded settings panel consume hotkey popup pending messages', async () => {
    vi.mocked(takePendingAskMessage).mockResolvedValueOnce({
      kind: 'result',
      payload: askResult(),
    })

    render(<AskPanel embedded />)
    await flushAsyncEffects()

    expect(takePendingAskMessage).not.toHaveBeenCalled()
    expect(screen.queryByText('It turns speech into useful text.')).toBeNull()
  })

  it('records a spoken question, asks the model, and renders the answer', async () => {
    render(<AskPanel embedded />)

    fireEvent.click(screen.getByRole('button', { name: 'Record question' }))
    await waitFor(() => expect(startAskDictation).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Stop and ask' }))

    await waitFor(() => {
      expect(screen.getByText('It turns speech into useful text.')).toBeDefined()
    })
    expect(stopAskDictation).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask' })).toBeNull()
  })

  it('renders backend errors as popup content only', async () => {
    render(<AskPanel />)

    await emitWhenListening('ask:error', 'AI endpoint quota exceeded.')

    await waitFor(() => {
      expect(screen.getByText('AI endpoint quota exceeded.')).toBeDefined()
    })
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Something went wrong')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Close (Esc)' })).toBeDefined()
    expect(screen.queryByText('Error')).toBeNull()
  })

  it('does not abort global Ask when an idle panel unmounts', async () => {
    const { unmount } = render(<AskPanel />)
    await flushAsyncEffects()
    vi.mocked(abortAskDictation).mockClear()

    unmount()

    expect(abortAskDictation).not.toHaveBeenCalled()
  })

  it('aborts local dictation when the panel that started it unmounts', async () => {
    const { unmount } = render(<AskPanel embedded />)

    fireEvent.click(screen.getByRole('button', { name: 'Record question' }))
    await waitFor(() => expect(startAskDictation).toHaveBeenCalledTimes(1))
    vi.mocked(abortAskDictation).mockClear()

    unmount()

    expect(abortAskDictation).toHaveBeenCalledTimes(1)
  })

  it('does not abort after stop has handed the request to Ask processing', async () => {
    let resolveStop: (value: AskDictationResult) => void = () => {}
    vi.mocked(stopAskDictation).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStop = resolve
      }),
    )
    const { unmount } = render(<AskPanel embedded />)

    fireEvent.click(screen.getByRole('button', { name: 'Record question' }))
    await waitFor(() => expect(startAskDictation).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Stop and ask' }))
    await waitFor(() => expect(stopAskDictation).toHaveBeenCalledTimes(1))
    vi.mocked(abortAskDictation).mockClear()

    unmount()

    expect(abortAskDictation).not.toHaveBeenCalled()
    resolveStop({
      question: 'What is Typelite?',
      answer: 'It turns speech into useful text.',
      intent: 'open_question',
      output: 'popupAnswer',
      usedSelectedText: false,
      selectedTextTruncated: false,
      searchProvider: null,
      requestedPlacement: 'popup_answer',
      actualPlacement: 'popup_answer',
      fallbackReason: null,
      mayBeOutOfDate: false,
    })
  })

  describe('live questions (Plan `ask-translate-and-live-questions`)', () => {
    const liveResult = () =>
      askResult({
        question: "What's the AI news today?",
        answer: '',
        output: 'needsLiveInfo',
        actualPlacement: null,
      })

    async function showLiveResult() {
      render(<AskPanel />)
      await waitFor(() => {
        expect(tauriEventMock.listen).toHaveBeenCalledWith('ask:result', expect.any(Function))
      })
      act(() => tauriEventMock.emit('ask:result', liveResult()))
      return screen.findByTestId('ask-needs-live-info')
    }

    it('shows the needs-live-information state with Answer anyway and ✕', async () => {
      await showLiveResult()

      expect(screen.getByText('Needs live information')).toBeDefined()
      expect(
        screen.getByText(
          "This question needs up-to-date information from the web. Typelite can't look things up yet.",
        ),
      ).toBeDefined()
      expect(screen.getByText("What's the AI news today?")).toBeDefined()
      expect(screen.getByRole('button', { name: 'Answer anyway' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Close (Esc)' })).toBeDefined()
      // No web-search setup yet, and nothing to copy or insert.
      expect(screen.queryByText(/set up web search/i)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
      expect(screen.queryByText('About the highlight', { exact: false })).toBeNull()
    })

    it('answers anyway with the out-of-date note', async () => {
      vi.mocked(answerAskAnyway).mockResolvedValue(
        askResult({
          question: "What's the AI news today?",
          answer: 'Here is what I knew at training time.',
          mayBeOutOfDate: true,
        }),
      )
      await showLiveResult()

      fireEvent.click(screen.getByRole('button', { name: 'Answer anyway' }))

      expect(await screen.findByText('Here is what I knew at training time.')).toBeDefined()
      expect(answerAskAnyway).toHaveBeenCalledWith("What's the AI news today?")
      expect(screen.getByText('May be out of date — no web search was used')).toBeDefined()
      expect(screen.queryByTestId('ask-needs-live-info')).toBeNull()
    })

    it('shows an error when answering anyway fails', async () => {
      vi.mocked(answerAskAnyway).mockRejectedValue(new Error('AI unreachable'))
      await showLiveResult()

      fireEvent.click(screen.getByRole('button', { name: 'Answer anyway' }))

      expect(await screen.findByText('AI unreachable')).toBeDefined()
      expect(screen.queryByText('May be out of date — no web search was used')).toBeNull()
    })

    it('✕ closes the live-information panel', async () => {
      await showLiveResult()

      fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }))

      await waitFor(() => expect(screen.queryByTestId('ask-needs-live-info')).toBeNull())
      expect(closeAskPanel).toHaveBeenCalled()
      expect(answerAskAnyway).not.toHaveBeenCalled()
    })

    it('normal answers carry no out-of-date note', async () => {
      render(<AskPanel />)
      await waitFor(() => {
        expect(tauriEventMock.listen).toHaveBeenCalledWith('ask:result', expect.any(Function))
      })
      act(() => tauriEventMock.emit('ask:result', askResult()))
      expect(await screen.findByText('It turns speech into useful text.')).toBeDefined()
      expect(screen.queryByText('May be out of date — no web search was used')).toBeNull()
    })
  })

  it('uses localized copy for the voice-first ask flow', async () => {
    await i18n.changeLanguage('zh')
    render(<AskPanel embedded />)

    expect(screen.getByText('准备提问')).toBeDefined()
    expect(screen.getByText('说出问题，停止后自动回答')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: '录制问题' }))
    await waitFor(() => expect(screen.getByText('正在聆听')).toBeDefined())
    expect(screen.getByRole('button', { name: '停止并提问' })).toBeDefined()
  })
})
