import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import globalsCss from '../../../styles/globals.css?raw'
import i18n from '../../../i18n'
import { AskAnswerPanel, AskSourcesColumn } from '../AskAnswerPanel'
import { isCopyShortcut, isSelectAllShortcut, selectedTextWithin, textToCopy } from '../selection'
import { copyAskText, focusAskPanel, openAskSource } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  copyAskText: vi.fn(),
  focusAskPanel: vi.fn(() => Promise.resolve()),
  insertAskText: vi.fn(),
  openAskSource: vi.fn(() => Promise.resolve()),
  openSettingsPane: vi.fn(() => Promise.resolve()),
}))

const ANSWER = 'Sending the same request twice has the same effect as sending it once.'

function content(output: 'popupAnswer' | 'copiedFallback' = 'popupAnswer') {
  return {
    kind: 'result' as const,
    result: {
      question: 'What does idempotent mean?',
      answer: ANSWER,
      intent: 'ask_selection' as const,
      output,
      usedSelectedText: false,
      selectedTextTruncated: false,
      searchProvider: null,
      requestedPlacement: 'popup_answer' as const,
      actualPlacement: 'popup_answer' as const,
      fallbackReason: null,
      mayBeOutOfDate: false,
    },
  }
}

/** Highlights `length` characters of the first text node in `element`, as a mouse drag would. */
function select(element: Element, start: number, length: number) {
  const node = element.firstChild ?? element
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, start + length)
  const selection = document.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.mocked(copyAskText).mockResolvedValue(undefined)
})

afterEach(() => {
  document.getSelection()?.removeAllRanges()
  cleanup()
  vi.clearAllMocks()
})

// Plan `ask-panel-select-text`.
describe('selection helpers', () => {
  it('copies the highlighted part when there is one, else the whole text', () => {
    expect(textToCopy('same effect', ANSWER)).toBe('same effect')
    expect(textToCopy('', ANSWER)).toBe(ANSWER)
    expect(textToCopy('   ', ANSWER)).toBe(ANSWER)
  })

  it('reads only a selection that lies inside the root', () => {
    const inside = document.createElement('div')
    inside.textContent = 'inside text'
    const outside = document.createElement('div')
    outside.textContent = 'outside text'
    document.body.append(inside, outside)
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(inside.firstChild!, 0)
    range.setEnd(inside.firstChild!, 6)
    selection.removeAllRanges()
    selection.addRange(range)
    expect(selectedTextWithin(inside, selection)).toBe('inside')
    expect(selectedTextWithin(outside, selection)).toBe('')
    selection.collapseToStart()
    expect(selectedTextWithin(inside, selection)).toBe('')
    expect(selectedTextWithin(null, selection)).toBe('')
    inside.remove()
    outside.remove()
  })
})

describe('selectable answer', () => {
  it('styles the answer as selectable and never as a drag region', () => {
    render(<AskAnswerPanel content={content()} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
    const answer = screen.getByTestId('ask-panel-answer')
    expect(answer.className).toContain('ask-glass-answer')
    expect(answer.closest('[data-tauri-drag-region]')).toBeNull()
    expect(globalsCss.length).toBeGreaterThan(1000)
    const rule = globalsCss.match(/\.ask-glass-answer,[^{]*\.ask-source-title[^{]*\{([^}]*)\}/)
    expect(rule?.[1]).toContain('user-select: text')
  })

  it('a highlight makes the panel key; ⌘C copies just the highlight', () => {
    render(<AskAnswerPanel content={content()} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
    select(screen.getByTestId('ask-panel-answer'), ANSWER.indexOf('same effect'), 11)
    expect(focusAskPanel).toHaveBeenCalled()
    expect(copyAskText).not.toHaveBeenCalled()

    const event = new KeyboardEvent('keydown', { key: 'c', metaKey: true, cancelable: true })
    document.dispatchEvent(event)
    expect(copyAskText).toHaveBeenCalledWith('same effect')
    expect(event.defaultPrevented).toBe(true)
  })

  it('⌘C without a highlight in the panel, or C alone, copies nothing', () => {
    render(<AskAnswerPanel content={content()} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
    const outside = document.createElement('p')
    outside.textContent = 'outside'
    document.body.append(outside)
    select(outside, 0, 7)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true }))
    select(screen.getByTestId('ask-panel-answer'), 0, 7)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, shiftKey: true }),
    )
    expect(copyAskText).not.toHaveBeenCalled()
    outside.remove()
  })

  it('⌘A highlights the whole answer', () => {
    render(<AskAnswerPanel content={content()} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }))
    expect(document.getSelection()?.toString()).toBe(ANSWER)
  })

  it('a press in the text makes the panel key; a press on a button does not', () => {
    render(<AskAnswerPanel content={content()} onClose={vi.fn()} onAnswerAnyway={vi.fn()} />)
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Close (Esc)' }))
    expect(focusAskPanel).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByTestId('ask-panel-answer'))
    expect(focusAskPanel).toHaveBeenCalledTimes(1)
  })

  it('recognises only plain ⌘C and ⌘A', () => {
    const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)
    expect(isCopyShortcut(key({ key: 'c', metaKey: true }))).toBe(true)
    expect(isCopyShortcut(key({ key: 'C', metaKey: true }))).toBe(true)
    expect(isCopyShortcut(key({ key: 'c', ctrlKey: true }))).toBe(false)
    expect(isCopyShortcut(key({ key: 'c', metaKey: true, altKey: true }))).toBe(false)
    expect(isSelectAllShortcut(key({ key: 'a', metaKey: true }))).toBe(true)
    expect(isSelectAllShortcut(key({ key: 'a' }))).toBe(false)
  })

  it('the could-not-replace Copy button copies the highlight, else the whole answer', () => {
    render(
      <AskAnswerPanel
        content={content('copiedFallback')}
        onClose={vi.fn()}
        onAnswerAnyway={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Copied/ }))
    expect(copyAskText).toHaveBeenLastCalledWith(ANSWER)

    select(screen.getByText(ANSWER), 0, 7)
    expect(screen.queryByTestId('ask-panel-copy-selection')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Copied/ }))
    expect(copyAskText).toHaveBeenLastCalledWith('Sending')
  })

  it('a drag that highlights a source title does not open the source', () => {
    render(
      <AskSourcesColumn
        sources={[{ number: 1, title: 'Idempotence', url: 'https://example.com/a', snippet: '' }]}
        highlighted={null}
        onHide={vi.fn()}
      />,
    )
    const title = screen.getByText('Idempotence')
    select(title, 0, 4)
    fireEvent.click(title)
    expect(openAskSource).not.toHaveBeenCalled()

    document.getSelection()!.removeAllRanges()
    fireEvent.click(title)
    expect(openAskSource).toHaveBeenCalledWith('https://example.com/a')
  })
})
