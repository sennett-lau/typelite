import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchSetup } from '../WebSearchSetup'
import { progressShare, versionLabel } from '../builtinSearch'
import { useAppStore } from '../../../stores/appStore'
import {
  builtinSearchStatus,
  checkBuiltinSearchUpdate,
  getWebSearchStatus,
  installBuiltinSearch,
  removeBuiltinSearch,
  removeWebSearch,
  saveWebSearch,
  testWebSearch,
  updateBuiltinSearch,
  type BuiltinSearchProgress,
  type BuiltinSearchStatus,
} from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  BUILTIN_SEARCH_PROGRESS_EVENT: 'search:setup_progress',
  builtinSearchStatus: vi.fn(),
  checkBuiltinSearchUpdate: vi.fn(),
  installBuiltinSearch: vi.fn(),
  updateBuiltinSearch: vi.fn(),
  removeBuiltinSearch: vi.fn(),
  getWebSearchStatus: vi.fn(),
  saveWebSearch: vi.fn(),
  removeWebSearch: vi.fn(),
  testWebSearch: vi.fn(),
}))
const progressListeners: ((event: { payload: BuiltinSearchProgress }) => void)[] = []
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (_name: string, handler: (event: { payload: BuiltinSearchProgress }) => void) => {
      progressListeners.push(handler)
      return () => {}
    },
  ),
}))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }))
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const DEFAULT_CONFIG = useAppStore.getState().config
const off = { provider: 'none' as const, base_url: '' }
const builtin = { provider: 'builtin' as const, base_url: '' }
const notSetUp: BuiltinSearchStatus = { installed: null, running: false, port: null, busy: false }
const ready: BuiltinSearchStatus = {
  installed: {
    commit: '4e2c1ea7f468c9d1b16206e9d4079999a2eb0627',
    commitDate: '2026-09-28T10:00:00Z',
    installedAt: 1,
  },
  running: true,
  port: 8888,
  busy: false,
}

function setSaved(webSearch: typeof off | typeof builtin) {
  useAppStore.setState({
    config: { ...DEFAULT_CONFIG, web_search: webSearch },
    savedConfig: { ...DEFAULT_CONFIG, web_search: webSearch },
  })
}

describe('WebSearchSetup (plan `searxng-setup`)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progressListeners.length = 0
    setSaved(off)
    vi.mocked(getWebSearchStatus).mockResolvedValue({ config: off, hasKey: false })
    vi.mocked(builtinSearchStatus).mockResolvedValue(notSetUp)
  })
  afterEach(cleanup)

  it('offers Built-in first, and Set up explains what it downloads', async () => {
    render(<WebSearchSetup />)
    expect(screen.getByRole('radio', { name: /Built-in/ })).toHaveAttribute('aria-checked', 'true')
    expect(await screen.findByText('Set up SearXNG on this Mac')).toBeInTheDocument()
    expect(screen.getByText(/About 230 MB, from GitHub/)).toBeInTheDocument()
    expect(installBuiltinSearch).not.toHaveBeenCalled()
  })

  it('sets up with progress, then turns Built-in on', async () => {
    let finish: (status: BuiltinSearchStatus) => void = () => {}
    vi.mocked(installBuiltinSearch).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    vi.mocked(saveWebSearch).mockResolvedValue({ config: builtin, hasKey: false })
    render(<WebSearchSetup />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }))

    expect(await screen.findByText('Setting up SearXNG…')).toBeInTheDocument()
    await waitFor(() => expect(progressListeners.length).toBeGreaterThan(0))
    act(() => {
      for (const listener of progressListeners)
        listener({ payload: { step: 'downloadingSearxng', done: 12_000_000, total: 24_000_000 } })
    })
    expect(screen.getByTestId('builtin-search-steps').textContent).toContain('12.0 of 24.0 MB')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')

    vi.mocked(builtinSearchStatus).mockResolvedValue(ready)
    await act(async () => finish(ready))
    await waitFor(() => expect(saveWebSearch).toHaveBeenCalledWith('builtin', ''))
    expect(useAppStore.getState().config.web_search).toEqual(builtin)
    expect(await screen.findByText('SearXNG on this Mac')).toBeInTheDocument()
  })

  it('shows why a setup failed and offers Try again', async () => {
    vi.mocked(installBuiltinSearch).mockRejectedValue(
      'Download SearXNG: could not reach github.com',
    )
    render(<WebSearchSetup />)
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not reach github.com')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(saveWebSearch).not.toHaveBeenCalled()
  })

  it('when ready: version, address, Test, update and remove', async () => {
    setSaved(builtin)
    vi.mocked(builtinSearchStatus).mockResolvedValue(ready)
    vi.mocked(testWebSearch).mockResolvedValue({ results: 40, ms: 1900 })
    vi.mocked(checkBuiltinSearchUpdate).mockResolvedValue({
      latestCommit: 'abcdef0123456789',
      latestDate: '2026-10-03T08:00:00Z',
      updateAvailable: true,
    })
    vi.mocked(updateBuiltinSearch).mockResolvedValue(ready)
    vi.mocked(removeBuiltinSearch).mockResolvedValue(notSetUp)
    vi.mocked(removeWebSearch).mockResolvedValue({ config: off, hasKey: false })
    render(<WebSearchSetup />)

    const card = await screen.findByTestId('builtin-search-card')
    await waitFor(() => expect(card.textContent).toContain('4e2c1ea'))
    expect(card.textContent).toContain('127.0.0.1:8888')
    expect(card.textContent).toContain('Running')

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(testWebSearch).toHaveBeenCalledWith('builtin', '')
    await waitFor(() => expect(card.textContent).toContain('Works: 40 results'))

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }))
    await waitFor(() => expect(updateBuiltinSearch).toHaveBeenCalled())

    fireEvent.click(await screen.findByRole('button', { name: 'Remove…' }))
    expect(screen.getByText(/frees about 230 MB/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(removeBuiltinSearch).toHaveBeenCalled())
    await waitFor(() => expect(removeWebSearch).toHaveBeenCalled())
    expect(useAppStore.getState().config.web_search).toEqual(off)
  })

  it('Your own SearXNG shows the address form without a provider menu', async () => {
    render(<WebSearchSetup />)
    fireEvent.click(screen.getByRole('radio', { name: /Your own SearXNG/ }))
    expect(await screen.findByTestId('web-search-form')).toBeInTheDocument()
    expect(screen.getByLabelText('Address')).toBeInTheDocument()
    expect(screen.queryByLabelText('Provider')).toBeNull()
  })

  it('helpers: version label and progress share', () => {
    expect(versionLabel('4e2c1ea7f468', '2026-09-28T10:00:00Z')).toMatch(
      /^28 \S+ 2026 \(4e2c1ea\)$/,
    )
    expect(progressShare(null)).toBeCloseTo(0.02)
    expect(progressShare({ step: 'installingPython', done: null, total: null })).toBeCloseTo(0.2)
    expect(progressShare({ step: 'done', done: null, total: null })).toBe(1)
  })
})
