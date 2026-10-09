/**
 * Plan `hands-free-mode` (settings.md): the Hands-free switch, wake name, sensitivity and the
 * wake model download.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../stores/appStore'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

const idleSetup = {
  modelId: null,
  phase: 'idle',
  downloadedBytes: 0,
  totalBytes: 0,
  bytesPerSecond: 0,
  error: null,
}

vi.mock('../../../lib/tauri', () => ({
  HANDS_FREE_SETUP_EVENT: 'hands-free:setup',
  getHandsFreeStatus: vi.fn(),
  downloadHandsFreeModel: vi.fn().mockResolvedValue(undefined),
  cancelHandsFreeModelDownload: vi.fn().mockResolvedValue(true),
}))

import { downloadHandsFreeModel, getHandsFreeStatus } from '../../../lib/tauri'
import { HandsFreeSettings } from '../HandsFreeSettings'

function handsFree() {
  return useAppStore.getState().config.hands_free
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.mocked(getHandsFreeStatus).mockResolvedValue({
    listener: 'off',
    modelInstalled: true,
    modelSizeBytes: 59_707_625,
    setup: idleSetup as never,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HandsFreeSettings', () => {
  it('is off by default and shows only the switch', () => {
    render(<HandsFreeSettings />)
    expect(handsFree().enabled).toBe(false)
    expect(screen.getByRole('switch', { name: 'settings.handsFree.enable' })).toBeInTheDocument()
    expect(screen.queryByLabelText('settings.handsFree.wakeName')).toBeNull()
  })

  it('turning it on shows the wake name and sensitivity, which write to the config', () => {
    render(<HandsFreeSettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'settings.handsFree.enable' }))
    expect(handsFree().enabled).toBe(true)

    const name = screen.getByLabelText('settings.handsFree.wakeName')
    expect(name).toHaveValue('Sam')
    fireEvent.change(name, { target: { value: 'Jarvis' } })
    expect(handsFree().wake_name).toBe('Jarvis')

    fireEvent.click(screen.getByRole('button', { name: 'settings.handsFree.high' }))
    expect(handsFree().sensitivity).toBe('high')
  })

  it('offers the wake model download when it is missing', async () => {
    vi.mocked(getHandsFreeStatus).mockResolvedValue({
      listener: 'needsModel',
      modelInstalled: false,
      modelSizeBytes: 59_707_625,
      setup: idleSetup as never,
    })
    useAppStore.getState().updateConfig({
      hands_free: { enabled: true, wake_name: 'Sam', sensitivity: 'normal' },
    })
    render(<HandsFreeSettings />)
    expect(await screen.findByText('settings.handsFree.needsModel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settings.handsFree.download' }))
    expect(downloadHandsFreeModel).toHaveBeenCalledTimes(1)
  })
})
