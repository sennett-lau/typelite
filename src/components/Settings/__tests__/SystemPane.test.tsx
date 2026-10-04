import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { useAppStore } from '../../../stores/appStore'
import * as tauri from '../../../lib/tauri'
import { SystemPane } from '../SystemPane'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}))

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

it.each([
  ['Launch at login', 'auto_start'],
  ['Show in Dock', 'show_in_dock'],
] as const)('updates %s in the config', (label, field) => {
  render(<SystemPane />)
  const toggle = screen.getByRole('switch', { name: label })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(toggle)
  expect(useAppStore.getState().config[field]).toBe(false)
  fireEvent.click(toggle)
  expect(useAppStore.getState().config[field]).toBe(true)
})

describe('SystemPane: Clear insights data (plan speed-by-preset)', () => {
  it('deletes the kept run timings and says so', async () => {
    vi.mocked(tauri.clearRunTimings).mockResolvedValue(undefined)
    render(<SystemPane />)

    expect(screen.getByText('Clear insights data')).toBeInTheDocument()
    expect(screen.getByText(/never what you said/)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    expect(tauri.clearRunTimings).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Cleared')
  })

  it('says when the data could not be cleared', async () => {
    vi.mocked(tauri.clearRunTimings).mockRejectedValue('permission denied')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<SystemPane />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })

    expect(screen.getByRole('status')).toHaveTextContent('Could not clear the data.')
    consoleError.mockRestore()
  })
})

describe('SystemPane: typing speed (plan typing-speed-and-nudge)', () => {
  it('switches typing speed measuring off and on', () => {
    render(<SystemPane />)
    const measure = screen.getByRole('switch', { name: 'Measure typing speed' })
    expect(useAppStore.getState().config.measure_typing_speed).toBe(true)
    fireEvent.click(measure)
    expect(useAppStore.getState().config.measure_typing_speed).toBe(false)
    fireEvent.click(measure)
    expect(useAppStore.getState().config.measure_typing_speed).toBe(true)
  })

  it('resets the speed stats and says so', async () => {
    vi.mocked(tauri.resetSpeedStats).mockResolvedValue(undefined)
    render(<SystemPane />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    })
    expect(tauri.resetSpeedStats).toHaveBeenCalledTimes(1)
    expect(tauri.clearRunTimings).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Reset')
  })
})

describe('SystemPane: updates (plan auto-update)', () => {
  it('turns automatic updates on by default and checks on request', async () => {
    vi.mocked(tauri.updateStatus).mockResolvedValue({ state: 'idle' })
    vi.mocked(tauri.checkForUpdate).mockResolvedValue({ state: 'upToDate', checkedAt: 1 })
    render(<SystemPane />)

    const toggle = screen.getByRole('switch', { name: 'Update automatically' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(useAppStore.getState().config.auto_update).toBe(false)

    const row = screen.getByTestId('update-check-row')
    fireEvent.click(within(row).getByRole('button', { name: 'Check for updates' }))
    expect(tauri.checkForUpdate).toHaveBeenCalled()
    expect(await within(row).findByText('You have the newest version.')).toBeInTheDocument()
  })

  it('offers Update when a check found a new version', async () => {
    vi.mocked(tauri.updateStatus).mockResolvedValue({
      state: 'available',
      version: '1.1.0',
      notes: '',
    })
    render(<SystemPane />)
    const row = screen.getByTestId('update-check-row')
    expect(await within(row).findByRole('button', { name: 'Update' })).toBeInTheDocument()
  })
})
