import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WelcomeStep } from '../WelcomeStep'
import { PERMISSION_POLL_MS, usePermissions } from '../usePermissions'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

function Harness({ onSkip = () => {} }: { onSkip?: () => void }) {
  const permissions = usePermissions(true)
  return (
    <>
      <span data-testid="all-granted">{String(permissions.allGranted)}</span>
      <WelcomeStep permissions={permissions} onSkip={onSkip} />
    </>
  )
}

function row(id: string) {
  return screen.getByTestId(`permission-${id}`)
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.getMicrophonePermission).mockResolvedValue('not_determined')
  vi.mocked(tauri.getAutomationPermission).mockResolvedValue('not_determined')
  vi.mocked(tauri.checkAccessibilityPermission).mockResolvedValue(false)
  vi.mocked(tauri.requestAccessibilityPermission).mockResolvedValue(false)
  vi.mocked(tauri.resumeHotkey).mockResolvedValue(undefined)
  vi.mocked(tauri.openPrivacySettings).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WelcomeStep permissions', () => {
  it('shows one row with a Grant button per permission', async () => {
    render(<Harness />)

    for (const id of ['microphone', 'accessibility', 'automation']) {
      await waitFor(() => expect(row(id)).toHaveAttribute('data-status', 'not_determined'))
      expect(within(row(id)).getByRole('button', { name: /^Grant/ })).toBeInTheDocument()
    }
    expect(screen.getByText('Microphone')).toBeInTheDocument()
    expect(screen.getByText('Accessibility')).toBeInTheDocument()
    expect(screen.getByText('Automation')).toBeInTheDocument()
    expect(screen.getByTestId('all-granted')).toHaveTextContent('false')
  })

  it('grants the microphone and flips the row to Granted', async () => {
    vi.mocked(tauri.requestMicrophonePermission).mockResolvedValue('granted')
    render(<Harness />)
    await waitFor(() => expect(row('microphone')).toHaveAttribute('data-status', 'not_determined'))

    fireEvent.click(within(row('microphone')).getByRole('button', { name: /^Grant/ }))

    await waitFor(() => expect(row('microphone')).toHaveAttribute('data-status', 'granted'))
    expect(within(row('microphone')).getByText('Granted')).toBeInTheDocument()
    expect(tauri.requestMicrophonePermission).toHaveBeenCalledTimes(1)
  })

  it('offers System Settings when Automation was denied', async () => {
    vi.mocked(tauri.requestAutomationPermission).mockResolvedValue('denied')
    render(<Harness />)
    await waitFor(() => expect(row('automation')).toHaveAttribute('data-status', 'not_determined'))

    fireEvent.click(within(row('automation')).getByRole('button', { name: /^Grant/ }))

    await waitFor(() => expect(row('automation')).toHaveAttribute('data-status', 'denied'))
    fireEvent.click(within(row('automation')).getByRole('button', { name: 'Open Settings' }))
    expect(tauri.openPrivacySettings).toHaveBeenCalledWith('automation')
  })

  it('shows a failed grant with a retry', async () => {
    vi.mocked(tauri.requestMicrophonePermission).mockRejectedValue('no audio service')
    render(<Harness />)
    await waitFor(() => expect(row('microphone')).toHaveAttribute('data-status', 'not_determined'))

    fireEvent.click(within(row('microphone')).getByRole('button', { name: /^Grant/ }))

    expect(await within(row('microphone')).findByText('no audio service')).toBeInTheDocument()
    expect(within(row('microphone')).getByRole('button', { name: /Microphone/ })).toHaveTextContent(
      'Retry',
    )
  })

  it('polls live and re-registers shortcuts when Accessibility turns on', async () => {
    vi.useFakeTimers()
    render(<Harness />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(row('accessibility')).toHaveAttribute('data-status', 'not_determined')
    expect(tauri.resumeHotkey).not.toHaveBeenCalled()

    vi.mocked(tauri.checkAccessibilityPermission).mockResolvedValue(true)
    vi.mocked(tauri.getMicrophonePermission).mockResolvedValue('granted')
    vi.mocked(tauri.getAutomationPermission).mockResolvedValue('granted')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PERMISSION_POLL_MS)
    })

    expect(row('accessibility')).toHaveAttribute('data-status', 'granted')
    expect(tauri.resumeHotkey).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().accessibilityTrusted).toBe(true)
    expect(screen.getByTestId('all-granted')).toHaveTextContent('true')
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
  })

  it('"Skip for now" is offered while something is missing', async () => {
    const onSkip = vi.fn()
    render(<Harness onSkip={onSkip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(onSkip).toHaveBeenCalled()
  })
})
