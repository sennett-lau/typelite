import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { AskAnswerPanel, AskSourcesColumn, type AskPanelContent } from '../AskAnswerPanel'
import { isLongAnswer, panelWidth } from '../liveSearch'
import { copyAskText, insertAskText, openAskSource } from '../../../lib/tauri'
import type { AskDictationResult } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  copyAskText: vi.fn(),
  focusAskPanel: vi.fn(() => Promise.resolve()),
  insertAskText: vi.fn(),
  openAskSource: vi.fn(() => Promise.resolve()),
  openSettingsPane: vi.fn(() => Promise.resolve()),
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
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

// Plan `ask-panel-above-pill`: one glass panel for every Ask outcome.
describe('AskAnswerPanel', () => {
  it('shows the question, the answer, and the Esc hint, no action button', () => {
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
    // Plan `ask-web-search`: an answer has no action button.
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Insert at the cursor' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close (Esc)' })).toBeDefined()
  })

  it('marks a question about the highlight', () => {
    renderPanel(result({ usedSelectedText: true }))
    expect(screen.getByTestId('ask-panel-question').textContent).toBe(
      'About the highlight · What does idempotent mean here?',
    )
    expect(screen.queryByRole('button', { name: 'Replace the highlight' })).toBeNull()
  })

  it('shows sources in a column: summary, citation, open and copy link', async () => {
    renderPanel(
      result({
        question: 'latest tech news today',
        answer: 'Chips are up [1]. A new phone [2][3]. Not a source [9].',
        sources: [
          {
            number: 1,
            title: 'Reuters Technology News',
            url: 'https://www.reuters.com/technology/',
            snippet: 'Chip makers rally.',
          },
          { number: 2, title: 'The Verge', url: 'https://www.theverge.com/', snippet: '' },
          { number: 3, title: 'WIRED', url: 'https://www.wired.com/', snippet: 'A new phone.' },
        ],
      }),
    )

    const answer = screen.getByTestId('ask-panel-answer')
    expect(answer.textContent).toBe('Chips are up 1. A new phone 23. Not a source [9].')
    // Closed at first: only the summary in the footer.
    expect(screen.queryByTestId('ask-panel-sources')).toBeNull()
    expect(screen.getByTestId('ask-panel-sources-summary').textContent).toContain('3 sources')

    // A citation opens the column on its source, without opening the page.
    fireEvent.click(screen.getByRole('button', { name: 'Show source 2' }))
    const column = screen.getByTestId('ask-panel-sources')
    expect(column.textContent).toContain('Reuters Technology News')
    expect(column.textContent).toContain('reuters.com')
    expect(column.textContent).toContain('Chip makers rally.')
    expect(screen.getByTestId('ask-source-2').className).toContain('is-highlighted')
    expect(openAskSource).not.toHaveBeenCalled()

    // Icons and their labelled tooltips are available before any hover.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open source 1' })).toBeVisible())
    for (const number of [1, 2, 3]) {
      const card = screen.getByTestId(`ask-source-${number}`)
      const buttons = within(card).getAllByRole('button')
      expect(buttons).toHaveLength(2)
      for (const button of buttons) {
        expect(button).toBeVisible()
        expect(button).toHaveAttribute('title', button.getAttribute('aria-label'))
        expect(button.textContent).toBe('')
        expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      }
    }

    // Open and Copy link go through the app.
    fireEvent.click(screen.getByRole('button', { name: 'Open source 3' }))
    expect(openAskSource).toHaveBeenCalledWith('https://www.wired.com/')
    expect(openAskSource).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Source 3 opened' })).toHaveAttribute(
      'title',
      'Source 3 opened',
    )
    vi.mocked(copyAskText).mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link of source 1' }))
    expect(copyAskText).toHaveBeenCalledWith('https://www.reuters.com/technology/')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Link of source 1 copied' })).toHaveAttribute(
        'title',
        'Link of source 1 copied',
      ),
    )
    expect(openAskSource).toHaveBeenCalledTimes(1)
    expect(copyAskText).toHaveBeenCalledTimes(1)

    // A click anywhere on a card opens it too; › hides the column.
    fireEvent.click(screen.getByText('The Verge'))
    expect(openAskSource).toHaveBeenLastCalledWith('https://www.theverge.com/')
    expect(openAskSource).toHaveBeenCalledTimes(2)
    // › slides the column out first, then it goes (and the panel shrinks).
    fireEvent.click(screen.getByRole('button', { name: 'Hide sources' }))
    expect(screen.getByTestId('ask-panel-sources')).toHaveAttribute('data-closing', 'true')
    await waitFor(() => expect(screen.queryByTestId('ask-panel-sources')).toBeNull())
  })

  it('restores the source action icons after confirmation and translates their labels', async () => {
    await i18n.changeLanguage('zh')
    vi.useFakeTimers()
    render(
      <AskSourcesColumn
        sources={[{ number: 1, title: 'Example', url: 'https://example.com', snippet: '' }]}
        highlighted={null}
        onHide={vi.fn()}
      />,
    )
    const open = screen.getByRole('button', { name: '打开来源 1' })
    expect(open).toHaveAttribute('title', '打开来源 1')
    fireEvent.click(open)
    expect(screen.getByRole('button', { name: '已打开来源 1' }).querySelector('svg')).toHaveClass(
      'lucide-check',
    )
    act(() => vi.advanceTimersByTime(1500))
    expect(open).toHaveAttribute('aria-label', '打开来源 1')
    expect(open.querySelector('svg')).toHaveClass('lucide-external-link')

    const copy = screen.getByRole('button', { name: '复制来源 1 的链接' })
    expect(copy).toHaveAttribute('title', '复制来源 1 的链接')
    await act(async () => fireEvent.click(copy))
    expect(
      screen.getByRole('button', { name: '已复制来源 1 的链接' }).querySelector('svg'),
    ).toHaveClass('lucide-check')
    act(() => vi.advanceTimersByTime(1500))
    expect(copy).toHaveAttribute('aria-label', '复制来源 1 的链接')
    expect(copy.querySelector('svg')).toHaveClass('lucide-link2')
  })

  it('keeps a short answer at 420 pt and widens a long one to the limit', () => {
    const limits = { maxWidth: 1008, maxHeight: 443 }
    expect(panelWidth(false, false, limits)).toBe(420)
    expect(panelWidth(false, true, limits)).toBe(708)
    expect(panelWidth(true, false, limits)).toBe(1008)
    expect(panelWidth(true, true, limits)).toBe(1008)
    // A narrow screen never gets more than its limit.
    expect(panelWidth(false, true, { maxWidth: 500, maxHeight: 300 })).toBe(500)
    expect(isLongAnswer('Short.')).toBe(false)
    expect(isLongAnswer('x'.repeat(400))).toBe(true)
    expect(isLongAnswer('a\nb\nc\nd\ne')).toBe(true)
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
    expect(screen.getByText('关闭')).toBeDefined()
  })
})
