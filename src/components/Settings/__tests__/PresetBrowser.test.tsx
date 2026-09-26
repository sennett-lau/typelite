import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import * as tauri from '../../../lib/tauri'
import type { PresetListing } from '../../../lib/tauri'
import { PresetBrowser, PresetPreview } from '../languages/PresetBrowser'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }))
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function listing(overrides: Partial<PresetListing> = {}): PresetListing {
  return {
    id: 'english',
    name: 'English',
    tier: 'official',
    summary: 'Clear, natural English.',
    languages: ['en'],
    variant: 'en-GB',
    version: 2,
    authors: ['sennett-lau'],
    model_hint: 'Works with small 4B instruct models.',
    downloaded: true,
    ...overrides,
  }
}

function renderBrowser(selected = 'builtin') {
  const onSelect = vi.fn()
  const onBack = vi.fn()
  const onPreview = vi.fn()
  render(
    <PresetBrowser
      code="en"
      languageName="English"
      selected={selected}
      onSelect={onSelect}
      onBack={onBack}
      onPreview={onPreview}
    />,
  )
  return { onSelect, onBack, onPreview }
}

describe('PresetBrowser', () => {
  it('lists the built-in default first, then presets with their details', async () => {
    vi.mocked(tauri.listLanguagePresets).mockResolvedValue({
      presets: [
        listing(),
        listing({
          id: 'english-plain',
          name: 'English — plain',
          tier: 'community',
          variant: null,
          downloaded: false,
          model_hint: null,
          version: 1,
          authors: ['someone'],
        }),
      ],
      related: ['Australian casual'],
      offline: false,
    })
    const { onSelect, onPreview } = renderBrowser()

    const radios = await screen.findAllByRole('radio')
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    expect(radios[0]).toHaveTextContent('Built-in default')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    const official = screen.getAllByRole('radio')[1]
    expect(within(official).getByText('Official')).toBeInTheDocument()
    expect(within(official).getByText('Downloaded')).toBeInTheDocument()
    expect(official).toHaveTextContent(
      'en · notes for en-GB · v2 · by sennett-lau · Works with small 4B instruct models.',
    )
    const community = screen.getAllByRole('radio')[2]
    expect(within(community).getByText('Community')).toBeInTheDocument()
    expect(within(community).queryByText('Downloaded')).not.toBeInTheDocument()
    expect(screen.getByText('Related: Australian casual')).toBeInTheDocument()
    expect(screen.queryByText(/Can't reach/)).not.toBeInTheDocument()

    fireEvent.click(community)
    expect(onSelect).toHaveBeenCalledWith({
      kind: 'preset',
      listing: expect.objectContaining({ id: 'english-plain' }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(onPreview).toHaveBeenCalled()
    expect(tauri.listLanguagePresets).toHaveBeenCalledWith('en')
  })

  it('offline, shows a banner and tries again', async () => {
    vi.mocked(tauri.listLanguagePresets)
      .mockResolvedValueOnce({ presets: [listing()], related: [], offline: true })
      .mockResolvedValueOnce({ presets: [listing()], related: [], offline: false })
    renderBrowser()

    expect(
      await screen.findByText(
        "Can't reach the preset library. Showing downloaded presets and the built-in default.",
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/Can't reach/)).not.toBeInTheDocument())
    expect(tauri.listLanguagePresets).toHaveBeenCalledTimes(2)
  })

  it('opens the library on GitHub and goes back', async () => {
    vi.mocked(tauri.listLanguagePresets).mockResolvedValue({
      presets: [],
      related: [],
      offline: false,
    })
    const { onBack } = renderBrowser()
    fireEvent.click(screen.getByRole('button', { name: 'Library on GitHub' }))
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/sennett-lau/typelite/tree/main/presets/languages',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalled()
    await waitFor(() => expect(tauri.listLanguagePresets).toHaveBeenCalled())
  })
})

describe('PresetPreview', () => {
  it('shows the full rendered text with its regional note before use', () => {
    const onUse = vi.fn()
    render(
      <PresetPreview
        title="English"
        tier="official"
        meta="Clear English · v2 · by sennett-lau · CC0"
        text={'Write clear English.\n\nNotes for en-GB:\nBritish spelling.'}
        variant="en-GB"
        onBack={vi.fn()}
        onUse={onUse}
      />,
    )
    expect(screen.getByText('Full text sent to the AI (rendered for en-GB)')).toBeInTheDocument()
    expect(screen.getByTestId('preset-preview-text')).toHaveTextContent(
      'Notes for en-GB: British spelling.',
    )
    expect(screen.getByText("Checked against the library's hash.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this preset' }))
    expect(onUse).toHaveBeenCalled()
  })

  it('cannot be used while it failed to download', () => {
    render(
      <PresetPreview
        title="English"
        tier="official"
        meta={null}
        text=""
        variant={null}
        error="The preset could not be verified"
        onBack={vi.fn()}
        onUse={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The preset could not be verified')
    expect(screen.getByRole('button', { name: 'Use this preset' })).toBeDisabled()
  })
})
