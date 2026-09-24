import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MicrophoneStep } from '../MicrophoneStep'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

vi.mock('../../Settings/MicrophonePicker', () => ({
  MicrophonePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select aria-label="Microphone" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">System default</option>
      <option value="USB Mic">USB Mic</option>
    </select>
  ),
}))

/** The config passed to the last `updateConfig` call. */
function lastSaved() {
  const calls = vi.mocked(tauri.updateConfig).mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('MicrophoneStep', () => {
  it('saves the chosen device right away', async () => {
    render(<MicrophoneStep />)

    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'USB Mic' } })

    expect(useAppStore.getState().config.input_device).toBe('USB Mic')
    await waitFor(() => expect(lastSaved().input_device).toBe('USB Mic'))
  })

  it('shows a failed save', async () => {
    vi.mocked(tauri.updateConfig).mockRejectedValue('read-only')
    render(<MicrophoneStep />)

    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'USB Mic' } })

    expect(await screen.findByText('Could not save: read-only')).toBeInTheDocument()
  })
})
