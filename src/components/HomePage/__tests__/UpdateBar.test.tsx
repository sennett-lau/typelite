import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { UpdateBar } from '../UpdateBar'
import { downloadPercent } from '../../../lib/updates'
import { installUpdate, restartToUpdate, updateStatus, type UpdateStatus } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  UPDATE_STATUS_EVENT: 'update:status',
  updateStatus: vi.fn(),
  installUpdate: vi.fn(),
  restartToUpdate: vi.fn(() => Promise.resolve()),
}))
const listeners: ((event: { payload: UpdateStatus }) => void)[] = []
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: (event: { payload: UpdateStatus }) => void) => {
    listeners.push(handler)
    return () => {}
  }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: translate }) }))

function push(status: UpdateStatus) {
  act(() => {
    for (const listener of listeners) listener({ payload: status })
  })
}

describe('UpdateBar (plan auto-update)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners.length = 0
  })
  afterEach(cleanup)

  it('is hidden while nothing is waiting', async () => {
    vi.mocked(updateStatus).mockResolvedValue({ state: 'upToDate', checkedAt: 1 })
    render(<UpdateBar />)
    await waitFor(() => expect(updateStatus).toHaveBeenCalled())
    expect(screen.queryByTestId('update-bar')).toBeNull()
  })

  it('offers Update for an available version, then follows the download to Restart', async () => {
    vi.mocked(updateStatus).mockResolvedValue({ state: 'available', version: '1.1.0', notes: '' })
    vi.mocked(installUpdate).mockResolvedValue({ state: 'ready', version: '1.1.0', notes: '' })
    render(<UpdateBar />)

    const bar = await screen.findByTestId('update-bar')
    expect(bar).toHaveTextContent('Typelite 1.1.0 is available.')
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0))
    push({ state: 'downloading', version: '1.1.0', downloaded: 25, total: 100 })
    expect(screen.getByTestId('update-bar')).toHaveTextContent('25%')

    push({ state: 'ready', version: '1.1.0', notes: '' })
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }))
    expect(restartToUpdate).toHaveBeenCalled()
  })

  it('shows why an update it started failed', async () => {
    vi.mocked(updateStatus).mockResolvedValue({ state: 'available', version: '1.1.0', notes: '' })
    vi.mocked(installUpdate).mockResolvedValue({ state: 'failed', message: 'signature mismatch' })
    render(<UpdateBar />)
    fireEvent.click(await screen.findByRole('button', { name: 'Update' }))
    await waitFor(() =>
      expect(screen.getByTestId('update-bar')).toHaveTextContent('signature mismatch'),
    )
  })

  it('download percent needs a known size', () => {
    expect(
      downloadPercent({ state: 'downloading', version: '1', downloaded: 5, total: null }),
    ).toBe(null)
    expect(
      downloadPercent({ state: 'downloading', version: '1', downloaded: 50, total: 200 }),
    ).toBe(25)
  })
})
