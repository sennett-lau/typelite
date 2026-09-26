import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tauri from '../../../lib/tauri'
import type { LibraryStatus, PresetDetail } from '../../../lib/tauri'
import { useAppStore, type AppConfig, type TranslationConfig } from '../../../stores/appStore'
import { LanguageRows } from '../languages/LanguageRows'

vi.mock('../../../lib/tauri')
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const SHA = 'a'.repeat(64)
const EMPTY: LibraryStatus = { latest: {}, updates: {} }

function detail(overrides: Partial<PresetDetail> = {}): PresetDetail {
  return {
    id: 'cantonese-hong-kong',
    name: 'Cantonese (Hong Kong) 廣東話',
    tier: 'official',
    summary: 'Colloquial written Cantonese.',
    version: 2,
    sha256: SHA,
    authors: ['sennett-lau'],
    model_hint: null,
    text: 'Written Cantonese…',
    variant: null,
    detect_codes: ['yue', 'zh'],
    hints: ['嘅'],
    require_hint: true,
    applies_to: ['polish', 'translate'],
    ...overrides,
  }
}

function configWith(translation: TranslationConfig): AppConfig {
  return { ...useAppStore.getState().config, translation }
}

function renderRows(translation: TranslationConfig, status: LibraryStatus = EMPTY) {
  const config = configWith(translation)
  useAppStore.setState({ config, savedConfig: config })
  const onChange = vi.fn()
  const onEdit = vi.fn()
  render(<LanguageRows config={config} status={status} onChange={onChange} onEdit={onEdit} />)
  return { onChange, onEdit }
}

function row(code: string) {
  return screen.getByTestId(`language-row-${code}`)
}

beforeEach(() => {
  vi.mocked(tauri.loadLanguagePreset).mockResolvedValue(detail())
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LanguageRows', () => {
  it('shows one numbered row per language with where its instructions come from', async () => {
    renderRows({
      targets: ['zh-Hant-HK', 'en', 'ja'],
      active_target: 'en',
      languages: {
        'zh-Hant-HK': {
          instructions: null,
          library_preset: { id: 'cantonese-hong-kong', version: 2, sha256: SHA },
          auto_update: true,
        },
        en: { instructions: 'My English.' },
        ja: { instructions: null, enabled: false },
      },
    })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByText('1')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Chinese (Traditional, Hong Kong)')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(row('zh-Hant-HK')).getByText(
          'Cantonese (Hong Kong) 廣東話 preset · v2 · updates automatically',
        ),
      ).toBeInTheDocument(),
    )
    expect(within(row('en')).getByText('Built-in instructions · edited')).toBeInTheDocument()
    expect(within(row('ja')).getByText('Instructions off · plain translation')).toBeInTheDocument()
    expect(within(row('ja')).getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(within(row('en')).getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    // Three languages: no Add row.
    expect(screen.queryByRole('button', { name: /Add language/ })).not.toBeInTheDocument()
  })

  it('marks a language that needs an update decision', async () => {
    const preset = { id: 'cantonese-hong-kong', version: 2, sha256: SHA }
    const status: LibraryStatus = {
      latest: { 'cantonese-hong-kong': { version: 3, sha256: 'b'.repeat(64) } },
      updates: {},
    }
    renderRows(
      {
        targets: ['zh-Hant-HK', 'en'],
        active_target: 'en',
        languages: {
          'zh-Hant-HK': { instructions: 'Mine.', library_preset: preset, auto_update: true },
        },
      },
      status,
    )
    await waitFor(() =>
      expect(
        within(row('zh-Hant-HK')).getByText('Based on Cantonese (Hong Kong) 廣東話 · edited'),
      ).toBeInTheDocument(),
    )
    expect(within(row('zh-Hant-HK')).getByText('Update')).toBeInTheDocument()
    expect(within(row('en')).queryByText('Update')).not.toBeInTheDocument()
  })

  it('does not ask about updates that will apply by themselves', async () => {
    const preset = { id: 'cantonese-hong-kong', version: 2, sha256: SHA }
    renderRows(
      {
        targets: ['zh-Hant-HK'],
        active_target: 'zh-Hant-HK',
        languages: {
          'zh-Hant-HK': { instructions: null, library_preset: preset, auto_update: true },
        },
      },
      { latest: { 'cantonese-hong-kong': { version: 3, sha256: SHA } }, updates: {} },
    )
    await waitFor(() => expect(tauri.loadLanguagePreset).toHaveBeenCalled())
    expect(within(row('zh-Hant-HK')).queryByText('Update')).not.toBeInTheDocument()
  })

  it('saves the switch at once, only in the language settings', async () => {
    renderRows({ targets: ['en', 'ja'], active_target: 'en' })
    fireEvent.click(within(row('ja')).getByRole('switch', { name: 'Use instructions for 日本語' }))

    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    const saved = vi.mocked(tauri.updateConfig).mock.calls[0][0]
    expect(saved.translation.languages?.ja?.enabled).toBe(false)
    expect(useAppStore.getState().config.translation.languages?.ja?.enabled).toBe(false)
  })

  it('reorders by dragging a row onto another, and with the arrow keys on the handle', () => {
    const { onChange } = renderRows({ targets: ['en', 'ja', 'fr'], active_target: 'en' })

    fireEvent.dragStart(within(row('fr')).getByRole('button', { name: 'Move Français' }))
    fireEvent.dragOver(row('en'))
    fireEvent.drop(row('en'))
    expect(onChange).toHaveBeenLastCalledWith({
      targets: ['fr', 'en', 'ja'],
      active_target: 'en',
    })

    fireEvent.keyDown(within(row('en')).getByRole('button', { name: 'Move English' }), {
      key: 'ArrowDown',
    })
    expect(onChange).toHaveBeenLastCalledWith({
      targets: ['ja', 'en', 'fr'],
      active_target: 'en',
    })
    // The first row cannot move further up.
    onChange.mockClear()
    fireEvent.keyDown(within(row('en')).getByRole('button', { name: 'Move English' }), {
      key: 'ArrowUp',
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a language from the Add row and opens its sheet', () => {
    const { onChange, onEdit } = renderRows({ targets: ['en'], active_target: 'en' })
    expect(screen.getByText('up to 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add language/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Add language' }), {
      target: { value: 'zh-Hant-HK' },
    })
    expect(onChange).toHaveBeenCalledWith({ targets: ['en', 'zh-Hant-HK'], active_target: 'en' })
    expect(onEdit).toHaveBeenCalledWith('zh-Hant-HK')
  })

  it('removes a language, never the last one, and moves the active language', () => {
    const { onChange } = renderRows({ targets: ['en', 'ja'], active_target: 'ja' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove 日本語' }))
    expect(onChange).toHaveBeenCalledWith({ targets: ['en'], active_target: 'en' })

    cleanup()
    renderRows({ targets: ['en'], active_target: 'en' })
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('opens the sheet with Edit', () => {
    const { onEdit } = renderRows({ targets: ['en'], active_target: 'en' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit English' }))
    expect(onEdit).toHaveBeenCalledWith('en')
  })
})
