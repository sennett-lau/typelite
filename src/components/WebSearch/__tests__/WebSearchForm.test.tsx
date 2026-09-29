import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSearchForm } from '../WebSearchForm'
import { useAppStore } from '../../../stores/appStore'
import {
  getWebSearchStatus,
  removeWebSearch,
  saveWebSearch,
  testWebSearch,
} from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  getWebSearchStatus: vi.fn(),
  saveWebSearch: vi.fn(),
  removeWebSearch: vi.fn(),
  testWebSearch: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(() => Promise.resolve()) }))
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const ADDRESS = 'http://127.0.0.1:8888'
const off = { provider: 'none' as const, base_url: '' }
const on = { provider: 'searxng' as const, base_url: ADDRESS }

const DEFAULT_CONFIG = useAppStore.getState().config

describe('WebSearchForm (plan `ask-web-search`)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      config: { ...DEFAULT_CONFIG, web_search: off },
      savedConfig: { ...DEFAULT_CONFIG, web_search: off },
    })
    vi.mocked(getWebSearchStatus).mockResolvedValue({ config: off, hasKey: false })
  })
  afterEach(cleanup)

  it('starts empty and off: Save and Test need an address, nothing to remove', async () => {
    render(<WebSearchForm />)
    await waitFor(() => expect(getWebSearchStatus).toHaveBeenCalled())

    expect(screen.getByLabelText('Provider')).toHaveProperty('value', 'searxng')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Test' })).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: 'Turn off web search' })).toBeNull()
    expect(screen.getByLabelText('Key')).toHaveProperty(
      'placeholder',
      'Optional. SearXNG needs none',
    )
  })

  it('tests the typed address and shows the result count', async () => {
    vi.mocked(testWebSearch).mockResolvedValue({ results: 12, ms: 640 })
    render(<WebSearchForm />)

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: ADDRESS } })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(testWebSearch).toHaveBeenCalledWith('searxng', ADDRESS, undefined)
    expect(await screen.findByText(/Works: 12 results/)).toBeDefined()
  })

  it('shows why a test failed', async () => {
    vi.mocked(testWebSearch).mockRejectedValue(
      'The server refused JSON. In SearXNG’s settings.yml, add json to search.formats.',
    )
    render(<WebSearchForm />)

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: ADDRESS } })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText(/add json to search.formats/)).toBeDefined()
  })

  it('saves the address and key, and puts the saved config in the store', async () => {
    vi.mocked(saveWebSearch).mockResolvedValue({ config: on, hasKey: true })
    render(<WebSearchForm />)

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: ADDRESS } })
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(saveWebSearch).toHaveBeenCalledWith('searxng', ADDRESS, 'token')
    expect(await screen.findByText('Saved. Ask searches live questions now.')).toBeDefined()
    expect(useAppStore.getState().config.web_search).toEqual(on)
    expect(useAppStore.getState().savedConfig?.web_search).toEqual(on)
    expect(screen.getByLabelText('Key')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Key')).toHaveProperty(
      'placeholder',
      'Saved in the Keychain. Type to replace',
    )
  })

  it('an empty key field keeps the stored key; Remove key and Turn off clear it', async () => {
    useAppStore.setState({
      config: { ...DEFAULT_CONFIG, web_search: on },
      savedConfig: { ...DEFAULT_CONFIG, web_search: on },
    })
    vi.mocked(getWebSearchStatus).mockResolvedValue({ config: on, hasKey: true })
    vi.mocked(saveWebSearch)
      .mockResolvedValueOnce({ config: on, hasKey: true })
      .mockResolvedValueOnce({ config: on, hasKey: false })
    vi.mocked(removeWebSearch).mockResolvedValue({ config: off, hasKey: false })
    render(<WebSearchForm />)

    expect(screen.getByLabelText('Address')).toHaveProperty('value', ADDRESS)
    await screen.findByRole('button', { name: 'Remove key' })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveWebSearch).toHaveBeenLastCalledWith('searxng', ADDRESS, undefined)

    fireEvent.click(await screen.findByRole('button', { name: 'Remove key' }))
    expect(saveWebSearch).toHaveBeenLastCalledWith('searxng', ADDRESS, '')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Turn off web search' })).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Turn off web search' }))
    expect(await screen.findByText('Web search is off.')).toBeDefined()
    expect(removeWebSearch).toHaveBeenCalled()
    expect(useAppStore.getState().config.web_search).toEqual(off)
    expect(screen.getByLabelText('Address')).toHaveProperty('value', '')
  })
})
