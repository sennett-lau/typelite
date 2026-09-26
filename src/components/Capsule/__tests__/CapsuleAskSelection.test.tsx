import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../i18n'
import { CapsuleAskRecording } from '../CapsuleAskRecording'
import { CapsuleDone } from '../CapsuleComplete'

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../Waveform', () => ({
  Waveform: () => <div data-testid="waveform" />,
}))

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

// Plan `ask-panel-above-pill`: the Ask pill shows which highlight is included.
describe('Ask pill highlight chip', () => {
  it('shows "About …" with the start of the highlight while listening', () => {
    render(<CapsuleAskRecording selectionPreview="idempotent, so ret…" />)

    const chip = screen.getByTestId('ask-selection-chip')
    expect(chip.textContent).toBe('About “idempotent, so ret…”')
    expect(chip.getAttribute('title')).toBe('Asking about the highlighted text')
  })

  it('has no chip without a highlight', () => {
    render(<CapsuleAskRecording />)

    expect(screen.queryByTestId('ask-selection-chip')).toBeNull()
  })

  it('uses Chinese copy', async () => {
    await i18n.changeLanguage('zh')
    render(<CapsuleAskRecording selectionPreview="这是一段文字" />)

    expect(screen.getByTestId('ask-selection-chip').textContent).toBe('关于“这是一段文字”')
  })

  it('flashes "Replaced" after an edit replaced the highlight, else "Done"', () => {
    const { rerender } = render(<CapsuleDone replaced />)
    expect(screen.getByText('Replaced')).toBeDefined()

    rerender(<CapsuleDone />)
    expect(screen.getByText('Done')).toBeDefined()
  })
})
