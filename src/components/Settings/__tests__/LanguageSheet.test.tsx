import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import * as tauri from '../../../lib/tauri'
import type { LibraryStatus, PresetDetail } from '../../../lib/tauri'
import {
  useAppStore,
  type AppConfig,
  type TranslationLanguageSettings,
} from '../../../stores/appStore'
import { LanguageSheet } from '../languages/LanguageSheet'
import { SHEET_HEIGHT_TRANSITION, useAnimatedHeight } from '../languages/useAnimatedHeight'
import { resetTranslationDefaultsCache } from '../translationLanguages'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }))
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const SHA2 = 'a'.repeat(64)
const SHA3 = 'b'.repeat(64)
const HK_DEFAULT = 'Write colloquial written Cantonese (built-in).'
const HK_PRESET_TEXT = 'Written Cantonese (粵語白話文) v2.'
const EMPTY: LibraryStatus = { latest: {}, updates: {} }

function hk(overrides: Partial<PresetDetail> = {}): PresetDetail {
  return {
    id: 'cantonese-hong-kong',
    name: 'Cantonese (Hong Kong) 廣東話',
    tier: 'official',
    summary: 'Colloquial written Cantonese.',
    version: 2,
    sha256: SHA2,
    authors: ['sennett-lau'],
    model_hint: null,
    text: HK_PRESET_TEXT,
    variant: null,
    detect_codes: ['yue', 'zh'],
    hints: ['嘅', '咗'],
    require_hint: true,
    applies_to: ['polish', 'translate'],
    ...overrides,
  }
}

const HK_V3 = hk({ version: 3, sha256: SHA3, text: 'Written Cantonese v3.' })
const PRESET_V2 = { id: 'cantonese-hong-kong', version: 2, sha256: SHA2 }

function setup(languages: Record<string, TranslationLanguageSettings> = {}) {
  const base = useAppStore.getState().config
  const config: AppConfig = {
    ...base,
    translation: { targets: ['zh-Hant-HK', 'en'], active_target: 'en', languages },
  }
  useAppStore.setState({ config, savedConfig: config })
}

function renderSheet(status: LibraryStatus = EMPTY, code = 'zh-Hant-HK') {
  const onClose = vi.fn()
  render(<LanguageSheet code={code} status={status} onClose={onClose} />)
  return onClose
}

function lastSaved(): AppConfig {
  const calls = vi.mocked(tauri.updateConfig).mock.calls
  return calls[calls.length - 1][0] as AppConfig
}

function textarea() {
  return screen.getByRole('textbox', { name: 'Instructions' })
}

beforeEach(() => {
  resetTranslationDefaultsCache()
  vi.mocked(tauri.getTranslationLanguageDefaults).mockResolvedValue({
    'zh-Hant-HK': HK_DEFAULT,
    en: 'Translate into English.',
  })
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.loadLanguagePreset).mockResolvedValue(hk())
  vi.mocked(tauri.downloadLanguagePreset).mockResolvedValue(HK_V3)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LanguageSheet', () => {
  it('opens on the built-in default with the name, code and switch', async () => {
    setup()
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Chinese (Traditional, Hong Kong)' })
    expect(within(dialog).getByText('zh-Hant-HK')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Use instructions for Chinese (Traditional, Hong Kong)' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('On')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Instructions' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => expect(textarea()).toHaveValue(HK_DEFAULT))
    expect(
      screen.getByText(
        'Used when translating into Chinese (Traditional, Hong Kong) and when polishing speech in it.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Built-in default')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse presets' })).toBeInTheDocument()
    expect(screen.getByText(`${HK_DEFAULT.length} / 2000`)).toBeInTheDocument()
    // No preset: no automatic updates, nothing to reset.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument()
  })

  it('off shows only a note and Done, which saves the switch and keeps the text', async () => {
    setup({ 'zh-Hant-HK': { instructions: 'Mine.' } })
    const onClose = renderSheet()
    fireEvent.click(screen.getByRole('switch'))

    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.getByText(/Off: translating into Chinese/)).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastSaved().translation.languages?.['zh-Hant-HK']).toMatchObject({
      enabled: false,
      instructions: 'Mine.',
    })
  })

  it('shows a preset as the source, and an edit as based on it with Reset to preset', async () => {
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: PRESET_V2 } })
    renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    expect(screen.getByText('From:')).toBeInTheDocument()
    expect(screen.getByText('Official')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /Update this preset automatically/ }),
    ).not.toBeChecked()
    expect(screen.getByText('Checks GitHub once a day and uses the newest version.')).toBeVisible()

    fireEvent.change(textarea(), { target: { value: 'My Cantonese.' } })
    expect(screen.getByText('Based on:')).toBeInTheDocument()
    expect(screen.getByText('Edited')).toBeInTheDocument()
    expect(
      screen.getByText(
        'You edited the text, so new versions are offered here instead of replacing it.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to preset' }))
    expect(textarea()).toHaveValue(HK_PRESET_TEXT)
    expect(screen.queryByRole('button', { name: 'Reset to preset' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(textarea()).toHaveValue(HK_DEFAULT)
    expect(screen.getByText('Built-in default')).toBeInTheDocument()
  })

  it('saves the preset, the auto-update choice and the hints, only in the language settings', async () => {
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: PRESET_V2 } })
    useAppStore.setState((state) => ({ config: { ...state.config, polish_style: 'minimal' } }))
    const onClose = renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    fireEvent.click(screen.getByRole('checkbox', { name: /Update this preset automatically/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastSaved().translation.languages?.['zh-Hant-HK']).toEqual({
      instructions: null,
      library_preset: PRESET_V2,
      enabled: true,
      auto_update: true,
      user_hints: [],
    })
    // Other unsaved Settings edits stay unsaved.
    expect(lastSaved().polish_style).not.toBe('minimal')
    expect(useAppStore.getState().config.polish_style).toBe('minimal')
  })

  it('offers an update when not edited: Update switches to the new version', async () => {
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: PRESET_V2 } })
    renderSheet({ latest: { 'cantonese-hong-kong': { version: 3, sha256: SHA3 } }, updates: {} })
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('v3 available for Cantonese (Hong Kong) 廣東話.')
    fireEvent.click(within(banner).getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(textarea()).toHaveValue('Written Cantonese v3.'))
    expect(tauri.downloadLanguagePreset).toHaveBeenCalledWith('cantonese-hong-kong', 'zh-Hant-HK')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.languages?.['zh-Hant-HK']?.library_preset).toEqual({
      id: 'cantonese-hong-kong',
      version: 3,
      sha256: SHA3,
    })
  })

  it('previews an update before taking it', async () => {
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: PRESET_V2 } })
    renderSheet({ latest: { 'cantonese-hong-kong': { version: 3, sha256: SHA3 } }, updates: {} })
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Preview' }))

    expect(await screen.findByTestId('preset-preview-text')).toHaveTextContent(
      'Written Cantonese v3.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(textarea()).toHaveValue(HK_PRESET_TEXT)
  })

  it('edited text is never replaced: Keep mine moves the base, Use vN previews it', async () => {
    setup({ 'zh-Hant-HK': { instructions: 'My Cantonese.', library_preset: PRESET_V2 } })
    renderSheet({ latest: { 'cantonese-hong-kong': { version: 3, sha256: SHA3 } }, updates: {} })
    await waitFor(() => expect(textarea()).toHaveValue('My Cantonese.'))
    expect(screen.getByRole('status')).toHaveTextContent(
      "v3 available. You edited this text, so it wasn't replaced.",
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use v3 instead' }))
    expect(await screen.findByTestId('preset-preview-text')).toHaveTextContent(
      'Written Cantonese v3.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(textarea()).toHaveValue('My Cantonese.')

    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(textarea()).toHaveValue('My Cantonese.')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.languages?.['zh-Hant-HK']).toMatchObject({
      instructions: 'My Cantonese.',
      library_preset: { version: 3, sha256: SHA3 },
    })
  })

  it('says when a preset was updated automatically', async () => {
    const preset = { ...PRESET_V2 }
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: preset, auto_update: true } })
    renderSheet({
      latest: { 'cantonese-hong-kong': { version: 2, sha256: SHA2 } },
      updates: {
        'zh-Hant-HK': { id: 'cantonese-hong-kong', from: 1, to: 2, at: Date.now() / 1000 - 60 },
      },
    })
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    expect(screen.getByRole('status')).toHaveTextContent('Updated automatically to v2.')
    fireEvent.click(screen.getByRole('button', { name: 'See what it says' }))
    expect(await screen.findByTestId('preset-preview-text')).toHaveTextContent(HK_PRESET_TEXT)
  })

  it('browses, previews and uses a preset', async () => {
    setup()
    vi.mocked(tauri.listLanguagePresets).mockResolvedValue({
      presets: [
        {
          id: 'cantonese-hong-kong',
          name: 'Cantonese (Hong Kong) 廣東話',
          tier: 'official',
          summary: 'Colloquial written Cantonese.',
          languages: ['zh-Hant-HK', 'yue-Hant-HK'],
          variant: null,
          version: 3,
          authors: ['sennett-lau'],
          model_hint: null,
          downloaded: false,
        },
      ],
      related: ['Mandarin (Taiwan) 國語'],
      offline: false,
    })
    renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue(HK_DEFAULT))
    fireEvent.click(screen.getByRole('button', { name: 'Browse presets' }))

    const radios = await screen.findAllByRole('radio')
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2))
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getAllByRole('radio')[1])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByTestId('preset-preview-text')).toHaveTextContent(
      'Written Cantonese v3.',
    )
    expect(
      screen.getByText('Colloquial written Cantonese. · v3 · by sennett-lau · CC0'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this preset' }))

    await waitFor(() => expect(textarea()).toHaveValue('Written Cantonese v3.'))
    expect(screen.getByText('From:')).toBeInTheDocument()
    // Nothing is saved before Save.
    expect(tauri.updateConfig).not.toHaveBeenCalled()
  })

  it('shows what recognition hears and edits the user hints', async () => {
    setup({ 'zh-Hant-HK': { instructions: null, library_preset: PRESET_V2, user_hints: ['得閒'] } })
    const onClose = renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue(HK_PRESET_TEXT))
    fireEvent.click(screen.getByRole('tab', { name: 'Recognition' }))

    expect(screen.getByText('yue')).toBeInTheDocument()
    expect(screen.getByText('zh')).toBeInTheDocument()
    expect(screen.getByText('· Chinese counts only with a hint')).toBeInTheDocument()
    expect(screen.getByTitle('Added by you')).toHaveTextContent('得閒')
    expect(screen.getAllByTitle('From the preset').map((chip) => chip.textContent)).toEqual([
      '嘅',
      '咗',
    ])

    const input = screen.getByRole('textbox', { name: 'Add a hint' })
    fireEvent.change(input, { target: { value: ' 冇問題 ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // A preset hint or a duplicate is not added again.
    fireEvent.change(input, { target: { value: '嘅' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: '得閒' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getAllByTitle('Added by you').map((chip) => chip.textContent)).toEqual([
      '得閒',
      '冇問題',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Remove 得閒' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastSaved().translation.languages?.['zh-Hant-HK']?.user_hints).toEqual(['冇問題'])
  })

  it('without a preset, recognition relies on the user hints', async () => {
    setup()
    renderSheet(EMPTY, 'en')
    await waitFor(() => expect(textarea()).toHaveValue('Translate into English.'))
    fireEvent.click(screen.getByRole('tab', { name: 'Recognition' }))
    expect(
      screen.getByText('Speech detection needs a preset. Your own hints still work.'),
    ).toBeInTheDocument()
  })

  it('Cancel and Escape close without saving', async () => {
    setup()
    const onClose = renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue(HK_DEFAULT))
    fireEvent.change(textarea(), { target: { value: 'Something else' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(tauri.updateConfig).not.toHaveBeenCalled()
  })

  it('stores nothing for a language saved back to its defaults', async () => {
    setup({ 'zh-Hant-HK': { instructions: 'Mine.' } })
    renderSheet()
    await waitFor(() => expect(textarea()).toHaveValue('Mine.'))
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.languages).toEqual({})
  })
})

describe('useAnimatedHeight', () => {
  function Probe() {
    const [open, setOpen] = useState(false)
    const ref = useAnimatedHeight<HTMLDivElement>(open)
    return (
      <div ref={ref} data-testid="probe">
        <button type="button" onClick={() => setOpen((value) => !value)}>
          toggle
        </button>
      </div>
    )
  }

  function withHeights(heights: number[], reduced = false) {
    let call = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ height: heights[Math.min(call++, heights.length - 1)] }) as DOMRect,
    )
    window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as never
  }

  afterEach(() => vi.restoreAllMocks())

  it('eases from the old height to the new one, then goes back to auto', () => {
    vi.useFakeTimers()
    // First layout 100; after the change 200 (then the forced reflow read).
    withHeights([100, 200, 200])
    render(<Probe />)
    const probe = screen.getByTestId('probe')
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    expect(probe.style.height).toBe('200px')
    expect(probe.style.transition).toBe(SHEET_HEIGHT_TRANSITION)
    expect(probe.style.overflow).toBe('hidden')
    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(probe.style.height).toBe('')
    expect(probe.style.transition).toBe('')
    vi.useRealTimers()
  })

  it('changes at once with reduced motion', () => {
    withHeights([100, 200], true)
    render(<Probe />)
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    const probe = screen.getByTestId('probe')
    expect(probe.style.height).toBe('')
    expect(probe.style.transition).toBe('')
  })
})
