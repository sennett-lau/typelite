import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { AskAnswerPanel, type AskPanelContent } from '../AskAnswerPanel'
import { copyAskText, insertAskText, openAskSource, startAskFollowUp } from '../../../lib/tauri'
import type { AskDictationResult } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  copyAskText: vi.fn(),
  insertAskText: vi.fn(),
  openAskSource: vi.fn(() => Promise.resolve()),
  openSettingsPane: vi.fn(() => Promise.resolve()),
  startAskFollowUp: vi.fn(),
}))

function result(overrides: Partial<AskDictationResult> = {}): AskPanelContent {
  return {
    kind: 'result',
    result: {
      question: 'What does idempotent mean here?',
      answer: 'Sending the same request twice has the same effect as sending it once.',
      intent: 'ask_selection',
      output: 'popupAnswer',
      usedSelectedText: false,
      selectedTextTruncated: false,
      searchProvider: null,
      requestedPlacement: 'popup_answer',
      actualPlacement: 'popup_answer',
      fallbackReason: null,
      mayBeOutOfDate: false,
      ...overrides,
    },
  }
}

function renderPanel(content: AskPanelContent, props: { answering?: boolean } = {}) {
  const onClose = vi.fn()
  const onAnswerAnyway = vi.fn()
  render(
    <AskAnswerPanel
      content={content}
      onClose={onClose}
      onAnswerAnyway={onAnswerAnyway}
      answering={props.answering}
    />,
  )
  return { onClose, onAnswerAnyway }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.mocked(copyAskText).mockResolvedValue(undefined)
  vi.mocked(insertAskText).mockResolvedValue(undefined)
  vi.mocked(startAskFollowUp).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

// Plan `ask-panel-above-pill`: one glass panel for every Ask outcome.
describe('AskAnswerPanel', () => {
  it('shows the question, the answer, the Esc hint and Ask follow-up, no Copy or Insert', () => {
    renderPanel(result())

    const panel = screen.getByRole('dialog', { name: 'Ask answer' })
    expect(panel.className).toContain('ask-glass')
    expect(screen.getByTestId('ask-panel-question').textContent).toBe(
      'What does idempotent mean here?',
    )
    expect(
      screen.getByText('Sending the same request twice has the same effect as sending it once.'),
    ).toBeDefined()
    // Plan `compact-key-labels`: the cap shows "esc" and reads "Escape".
    const esc = screen.getByTitle('Escape')
    expect(esc.tagName).toBe('KBD')
    expect(esc.querySelector('[aria-hidden="true"]')?.textContent).toBe('esc')
    expect(esc.querySelector('.sr-only')?.textContent).toBe('Escape')
    expect(screen.getByText('to close')).toBeDefined()
    // Plan `ask-web-search`: answers offer only Ask follow-up.
    expect(screen.getByRole('button', { name: 'Ask follow-up' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Insert at the cursor' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close (Esc)' })).toBeDefined()
  })

  it('marks a question about the highlight, and a follow-up', () => {
    renderPanel(result({ usedSelectedText: true }))
    expect(screen.getByTestId('ask-panel-question').textContent).toBe(
      'About the highlight · What does idempotent mean here?',
    )
    expect(screen.queryByRole('button', { name: 'Replace the highlight' })).toBeNull()
    cleanup()

    renderPanel(result({ question: 'and after that?', followUp: true }))
    expect(screen.getByTestId('ask-panel-question').textContent).toBe('Follow-up · and after that?')
  })

  it('Ask follow-up starts a follow-up recording through the app', async () => {
    renderPanel(result())

    fireEvent.click(screen.getByRole('button', { name: 'Ask follow-up' }))

    await waitFor(() => expect(startAskFollowUp).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says so when the follow-up cannot start', async () => {
    vi.mocked(startAskFollowUp).mockRejectedValue(new Error('busy'))
    renderPanel(result())

    fireEvent.click(screen.getByRole('button', { name: 'Ask follow-up' }))

    expect((await screen.findByRole('status')).textContent).toBe(
      "Couldn't start the follow-up. Try the Ask shortcut.",
    )
    expect(screen.getByRole('dialog')).toBeDefined()
  })

  it('shows citations as small links and sources as title + domain chips', () => {
    renderPanel(
      result({
        question: 'latest tech news today',
        answer: 'Chips are up [1]. A new phone [2][3]. Not a source [9].',
        sources: [
          {
            number: 1,
            title: 'Reuters Technology News',
            url: 'https://www.reuters.com/technology/',
          },
          { number: 2, title: 'The Verge', url: 'https://www.theverge.com/' },
          { number: 3, title: 'WIRED', url: 'https://www.wired.com/' },
        ],
      }),
    )

    const answer = screen.getByTestId('ask-panel-answer')
    expect(answer.textContent).toBe('Chips are up 1. A new phone 23. Not a source [9].')
    fireEvent.click(screen.getByRole('button', { name: 'Open source 2' }))
    expect(openAskSource).toHaveBeenCalledWith('https://www.theverge.com/')

    const chips = screen.getByTestId('ask-panel-sources')
    expect(chips.textContent).toContain('Reuters Technology News')
    expect(chips.textContent).toContain('reuters.com')
    fireEvent.click(screen.getByRole('button', { name: /WIRED/ }))
    expect(openAskSource).toHaveBeenLastCalledWith('https://www.wired.com/')
  })

  it('offers a retry when the app did not allow the replacement', async () => {
    renderPanel(
      result({
        question: 'Make this shorter',
        answer: "idempotent: repeated requests don't duplicate orders",
        intent: 'rewrite_selection',
        output: 'copiedFallback',
        usedSelectedText: true,
        requestedPlacement: 'replace_selection',
        actualPlacement: null,
        fallbackReason: 'selection_lost',
      }),
    )

    expect(screen.getByTestId('ask-panel-question').textContent).toBe(
      'About the highlight · Make this shorter',
    )
    expect(screen.getByTestId('ask-panel-copied-note').textContent).toBe(
      "This app didn't allow the replacement. The result is on your clipboard.",
    )
    // Already on the clipboard: the primary button says so.
    expect(screen.getByRole('button', { name: 'Copied' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Insert at the cursor' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try replacing again' }))
    await waitFor(() =>
      expect(insertAskText).toHaveBeenCalledWith(
        "idempotent: repeated requests don't duplicate orders",
      ),
    )
  })

  it('offers Answer anyway for a question that needs live information', () => {
    const { onAnswerAnyway } = renderPanel(
      result({
        question: 'Is their status page showing an outage today?',
        answer: '',
        intent: 'open_question',
        output: 'needsLiveInfo',
        actualPlacement: null,
      }),
    )

    expect(screen.getByTestId('ask-needs-live-info')).toBeDefined()
    expect(screen.getByText('Needs live information')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Answer anyway' }))
    expect(onAnswerAnyway).toHaveBeenCalledTimes(1)
  })

  it('disables Answer anyway while it runs', () => {
    renderPanel(result({ answer: '', output: 'needsLiveInfo', actualPlacement: null }), {
      answering: true,
    })

    expect(
      (screen.getByRole('button', { name: 'Answer anyway' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('notes an answer that may be out of date', () => {
    renderPanel(result({ mayBeOutOfDate: true }))

    expect(screen.getByText('May be out of date — no web search was used')).toBeDefined()
  })

  it('shows errors in the same panel without actions', () => {
    renderPanel({ kind: 'error', message: 'AI endpoint quota exceeded.' })

    expect(screen.getByTestId('ask-panel-question').textContent).toBe('Something went wrong')
    expect(screen.getByTestId('ask-panel-error').textContent).toBe('AI endpoint quota exceeded.')
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.getByText('to close')).toBeDefined()
  })

  it('closes from ✕', () => {
    const { onClose } = renderPanel(result())

    fireEvent.click(screen.getByRole('button', { name: 'Close (Esc)' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('uses Chinese copy', async () => {
    await i18n.changeLanguage('zh')
    renderPanel(result({ usedSelectedText: true }))

    expect(screen.getByTestId('ask-panel-question').textContent).toBe(
      '关于选中文本 · What does idempotent mean here?',
    )
    expect(screen.getByRole('button', { name: '追问' })).toBeDefined()
    expect(screen.getByText('关闭')).toBeDefined()
  })
})
