import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
