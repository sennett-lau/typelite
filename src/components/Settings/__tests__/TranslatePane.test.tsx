import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { TranslatePane } from '../TranslatePane'
import * as tauri from '../../../lib/tauri'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

function baseConfig() {
  return {
    translation: { targets: ['en', 'zh-Hans', 'ja'], active_target: 'en' },
  }
}

const mockAppStore = {
  config: baseConfig(),
  updateConfig: vi.fn(),
}

vi.mock('../../../stores/appStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../stores/appStore')>()
  return {
    ...actual,
    useAppStore: Object.assign(
      (selector: any) => {
        if (typeof selector === 'function') {
          return selector(mockAppStore)
        }
        return mockAppStore
      },
      { getState: () => mockAppStore, setState: vi.fn() },
    ),
  }
})

// Plan `settings-order`: the translation languages have their own Settings → Translate pane
// (they were the Translation group of Settings → AI).
describe('TranslatePane', () => {
  beforeEach(() => {
    mockAppStore.config = baseConfig()
    vi.clearAllMocks()
    vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
    vi.mocked(openUrl).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows one row per translation language', () => {
    mockAppStore.config.translation = { targets: ['en'], active_target: 'en' }

    render(<TranslatePane />)
    const list = screen.getByRole('list', { name: 'Translation languages' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    // A single language stays single: no padding with other languages.
    expect(mockAppStore.updateConfig).not.toHaveBeenCalled()
  })

  // Plan `translation-language-presets` (2026-09-27): no "Always translate output" switch.
  // The Translation group holds only the languages the Translate shortcut uses.
  it('has no always-translate switch, only the languages list', () => {
    render(<TranslatePane />)

    const group = screen.getByRole('region', { name: 'Translation' })
    const list = within(group).getByRole('list', { name: 'Translation languages' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    // The only switches left are the languages' own on/off switches.
    const switches = within(group).getAllByRole('switch')
    expect(switches).toHaveLength(3)
    for (const toggle of switches) expect(list).toContainElement(toggle)
    expect(screen.queryByText('Always translate output')).not.toBeInTheDocument()
  })

  it('links the Translation group to the language presets guide', () => {
    render(<TranslatePane />)
    fireEvent.click(screen.getByRole('button', { name: 'About language presets' }))
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/sennett-lau/typelite/blob/main/docs/guides/languages/README.md#language-presets',
    )
  })
})
