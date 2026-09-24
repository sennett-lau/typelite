import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { MicrophonePicker } from '../MicrophonePicker'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri', () => ({
  listInputDevices: vi.fn(),
  startMicLevelMonitor: vi.fn(),
  stopMicLevelMonitor: vi.fn(),
}))

type LevelHandler = (event: { payload: number }) => void
const levelHandlers: LevelHandler[] = []
const unlistenSpy = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: LevelHandler) => {
    if (event === 'mic:level') levelHandlers.push(handler)
    return Promise.resolve(unlistenSpy)
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'mic.label': 'Input device',
        'mic.systemDefault': 'System default',
        'mic.systemDefaultWithName': 'System default ({{name}})',
        'mic.notConnected': '{{name}} (not connected)',
        'mic.refresh': 'Refresh microphone list',
        'mic.level': 'Input level',
        'mic.missing': '"{{name}}" is not connected.',
        'mic.listFailed': 'Could not list microphones.',
        'mic.monitorFailed': 'Could not open the microphone.',
        'mic.meterPaused': 'Level meter paused while recording.',
        'mic.bluetoothHint': 'Bluetooth hint',
      }
      let text = translations[key] ?? key
      for (const [name, value] of Object.entries(values ?? {})) {
        text = text.replace(`{{${name}}}`, value)
      }
      return text
    },
  }),
}))

const DEVICES: tauri.InputDeviceInfo[] = [
  { name: 'MacBook Pro Microphone', is_default: true },
  { name: 'USB Mic', is_default: false },
]

function emitLevel(level: number) {
  act(() => {
    for (const handler of levelHandlers) handler({ payload: level })
  })
}

describe('MicrophonePicker', () => {
  beforeEach(() => {
    levelHandlers.length = 0
    unlistenSpy.mockReset()
    vi.mocked(tauri.listInputDevices).mockReset().mockResolvedValue(DEVICES)
    vi.mocked(tauri.startMicLevelMonitor)
      .mockReset()
      .mockImplementation(async (device: string) => ({
        device_name: device || 'MacBook Pro Microphone',
        requested_device_missing: false,
      }))
    vi.mocked(tauri.stopMicLevelMonitor).mockReset().mockResolvedValue(undefined)
    useAppStore.setState({ pipelineState: 'idle' })
  })

  afterEach(() => {
    cleanup()
  })

  it('lists System default first, then every input device', async () => {
    render(<MicrophonePicker value="" onChange={() => {}} />)

    await screen.findByRole('option', { name: 'USB Mic' })
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual([
      'System default (MacBook Pro Microphone)',
      'MacBook Pro Microphone',
      'USB Mic',
    ])
    expect(screen.getByRole('combobox', { name: 'Input device' })).toHaveValue('')
  })

  it('reports the chosen device name', async () => {
    const onChange = vi.fn()
    render(<MicrophonePicker value="" onChange={onChange} />)
    await screen.findByRole('option', { name: 'USB Mic' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Input device' }), {
      target: { value: 'USB Mic' },
    })

    expect(onChange).toHaveBeenCalledWith('USB Mic')
  })

  it('starts the meter on the selected device and restarts it when the selection changes', async () => {
    const { rerender, unmount } = render(<MicrophonePicker value="" onChange={() => {}} />)
    await waitFor(() => expect(tauri.startMicLevelMonitor).toHaveBeenCalledWith(''))

    rerender(<MicrophonePicker value="USB Mic" onChange={() => {}} />)
    await waitFor(() => expect(tauri.startMicLevelMonitor).toHaveBeenCalledWith('USB Mic'))
    expect(tauri.stopMicLevelMonitor).toHaveBeenCalledTimes(1)
    // The stop for the old device is queued before the start for the new one.
    const stopOrder = vi.mocked(tauri.stopMicLevelMonitor).mock.invocationCallOrder[0]
    const secondStartOrder = vi.mocked(tauri.startMicLevelMonitor).mock.invocationCallOrder[1]
    expect(stopOrder).toBeLessThan(secondStartOrder)

    unmount()
    await waitFor(() => expect(tauri.stopMicLevelMonitor).toHaveBeenCalledTimes(2))
    expect(unlistenSpy).toHaveBeenCalled()
  })

  it('moves the meter with mic:level events', async () => {
    render(<MicrophonePicker value="" onChange={() => {}} />)
    await waitFor(() => expect(levelHandlers.length).toBeGreaterThan(0))

    emitLevel(0.1)
    expect(screen.getByTestId('mic-level-bar')).toHaveStyle({ width: '75%' })
    expect(screen.getByRole('meter', { name: 'Input level' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    )

    emitLevel(0.9)
    expect(screen.getByTestId('mic-level-bar')).toHaveStyle({ width: '100%' })
  })

  it('stops the meter while a recording is running', async () => {
    render(<MicrophonePicker value="" onChange={() => {}} />)
    await waitFor(() => expect(tauri.startMicLevelMonitor).toHaveBeenCalledTimes(1))

    act(() => {
      useAppStore.setState({ pipelineState: 'recording' })
    })

    await waitFor(() => expect(tauri.stopMicLevelMonitor).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Level meter paused while recording.')).toBeInTheDocument()
    expect(screen.getByTestId('mic-level-bar')).toHaveStyle({ width: '0%' })

    act(() => {
      useAppStore.setState({ pipelineState: 'idle' })
    })
    await waitFor(() => expect(tauri.startMicLevelMonitor).toHaveBeenCalledTimes(2))
  })

  it('keeps a saved device that is not connected and explains the fallback', async () => {
    render(<MicrophonePicker value="Unplugged Mic" onChange={() => {}} />)

    const option = await screen.findByRole('option', { name: 'Unplugged Mic (not connected)' })
    expect(option).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Input device' })).toHaveValue('Unplugged Mic')
    expect(screen.getByText('"Unplugged Mic" is not connected.')).toBeInTheDocument()
  })

  it('re-lists devices when Refresh is pressed', async () => {
    render(<MicrophonePicker value="" onChange={() => {}} />)
    await screen.findByRole('option', { name: 'USB Mic' })

    vi.mocked(tauri.listInputDevices).mockResolvedValue([
      ...DEVICES,
      { name: 'AirPods Pro', is_default: false },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Refresh microphone list' }))

    expect(await screen.findByRole('option', { name: 'AirPods Pro' })).toBeInTheDocument()
    expect(tauri.listInputDevices).toHaveBeenCalledTimes(2)
  })

  it('shows an error when the microphone cannot be opened', async () => {
    vi.mocked(tauri.startMicLevelMonitor).mockRejectedValue('No input device available')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<MicrophonePicker value="" onChange={() => {}} />)

    expect(await screen.findByText('Could not open the microphone.')).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
