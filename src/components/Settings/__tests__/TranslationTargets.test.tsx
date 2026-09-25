import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TranslationConfig } from '../../../stores/appStore'
import { TranslationTargets } from '../TranslationTargets'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

afterEach(cleanup)

function renderTargets(value: TranslationConfig = { targets: ['en'], active_target: 'en' }) {
  const onChange = vi.fn()
  render(<TranslationTargets value={value} onChange={onChange} />)
  return onChange
}

describe('TranslationTargets', () => {
  it('shows only the chosen language by default, with no remove button and an Add button', () => {
    const onChange = renderTargets()

    expect(screen.getAllByTestId(/^translation-target-/)).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'translate.setActive English' })).toBeChecked()
    expect(screen.getByTestId('translation-target-en')).toHaveTextContent('translate.defaultMark')
    // The last language cannot be removed.
    expect(screen.queryByRole('button', { name: /translate.remove/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'translate.addLanguage' })).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a language that is not chosen yet', () => {
    const onChange = renderTargets()

    fireEvent.click(screen.getByRole('button', { name: 'translate.addLanguage' }))
    const picker = screen.getByRole('combobox', { name: 'translate.addLanguage' })
    expect(screen.queryByRole('option', { name: 'English' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'translate.languages.zhHantHK' })).toBeInTheDocument()

    fireEvent.change(picker, { target: { value: 'zh-Hant-HK' } })
    expect(onChange).toHaveBeenCalledWith({ targets: ['en', 'zh-Hant-HK'], active_target: 'en' })
  })

  it('hides Add language at three languages', () => {
    renderTargets({ targets: ['en', 'zh-Hans', 'ja'], active_target: 'en' })

    expect(screen.getAllByTestId(/^translation-target-/)).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'translate.addLanguage' })).not.toBeInTheDocument()
  })

  it('marks another language as the default', () => {
    const onChange = renderTargets({ targets: ['en', 'ja'], active_target: 'en' })

    fireEvent.click(screen.getByRole('radio', { name: 'translate.setActive 日本語' }))

    expect(onChange).toHaveBeenCalledWith({ targets: ['en', 'ja'], active_target: 'ja' })
  })

  it('removes down to one language and moves the default mark off a removed language', () => {
    const onChange = renderTargets({ targets: ['en', 'ja', 'fr'], active_target: 'ja' })

    fireEvent.click(screen.getByRole('button', { name: 'translate.remove 日本語' }))

    expect(onChange).toHaveBeenCalledWith({ targets: ['en', 'fr'], active_target: 'fr' })
  })

  it('keeps per-language settings when the list changes', () => {
    const languages = { ja: { ai_preset_id: 'pc', instructions: null } }
    const onChange = renderTargets({ targets: ['en', 'ja'], active_target: 'en', languages })

    fireEvent.click(screen.getByRole('button', { name: 'translate.remove 日本語' }))

    expect(onChange).toHaveBeenCalledWith({ targets: ['en'], active_target: 'en', languages })
  })

  it("opens a language's settings from its edit button and tags custom languages", () => {
    const onChange = vi.fn()
    const onEdit = vi.fn()
    render(
      <TranslationTargets
        value={{ targets: ['en', 'zh-Hant-HK'], active_target: 'en' }}
        onChange={onChange}
        onEdit={onEdit}
        isCustom={(code) => code === 'zh-Hant-HK'}
      />,
    )

    expect(screen.getByTestId('translation-target-zh-Hant-HK')).toHaveTextContent(
      'translate.language.customTag',
    )
    expect(screen.getByTestId('translation-target-en')).not.toHaveTextContent(
      'translate.language.customTag',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'translate.language.edit translate.languages.zhHantHK' }),
    )
    expect(onEdit).toHaveBeenCalledWith('zh-Hant-HK')
    // Editing does not change the list or the default.
    expect(onChange).not.toHaveBeenCalled()
  })
})
