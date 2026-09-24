import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranslationConfig } from '../../../stores/appStore'
import { TranslationTargets } from '../TranslationTargets'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.number !== undefined ? `${key} ${options.number}` : key,
  }),
}))

afterEach(cleanup)

function renderTargets(
  value: TranslationConfig = {
    targets: ['en', 'zh', 'ja'],
    active_target: 'en',
  },
) {
  const onChange = vi.fn()
  render(<TranslationTargets value={value} onChange={onChange} />)
  return onChange
}

describe('TranslationTargets', () => {
  it('shows three slots with the active language marked and the cycling hint', () => {
    const onChange = renderTargets()

    expect(screen.getByRole('combobox', { name: 'translate.slot 1' })).toHaveValue('en')
    expect(screen.getByRole('combobox', { name: 'translate.slot 2' })).toHaveValue('zh')
    expect(screen.getByRole('combobox', { name: 'translate.slot 3' })).toHaveValue('ja')
    expect(screen.getByRole('radio', { name: 'translate.setActive English' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'translate.setActive 中文' })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: /translate.remove/ })).not.toBeInTheDocument()
    expect(screen.getByText('translate.cycleHint')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('pads fewer than three targets once with the first unused languages', () => {
    const onChange = renderTargets({ targets: ['ja'], active_target: 'ja' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ targets: ['ja', 'en', 'zh'], active_target: 'ja' })
  })

  it('marks another slot as the default language', () => {
    const onChange = renderTargets()

    fireEvent.click(screen.getByRole('radio', { name: 'translate.setActive 日本語' }))

    expect(onChange).toHaveBeenCalledWith({ targets: ['en', 'zh', 'ja'], active_target: 'ja' })
  })

  it('keeps language choices unique and moves the active mark with its slot', () => {
    const onChange = renderTargets()

    const second = screen.getByRole('combobox', { name: 'translate.slot 2' })
    expect(within(second).queryByRole('option', { name: 'English' })).not.toBeInTheDocument()
    expect(within(second).getByRole('option', { name: 'Français' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'translate.slot 1' }), {
      target: { value: 'fr' },
    })
    expect(onChange).toHaveBeenCalledWith({ targets: ['fr', 'zh', 'ja'], active_target: 'fr' })
  })

  it('shows existing slots 4 and 5 and allows removing down to three', () => {
    const onChange = renderTargets({
      targets: ['en', 'zh', 'ja', 'fr', 'de'],
      active_target: 'fr',
    })

    expect(screen.getAllByTestId(/^translation-target-/)).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: 'translate.remove Français' }))

    expect(onChange).toHaveBeenCalledWith({
      targets: ['en', 'zh', 'ja', 'de'],
      active_target: 'de',
    })
  })
})
