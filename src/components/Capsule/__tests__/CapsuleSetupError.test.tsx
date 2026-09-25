import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CapsuleError } from '../CapsuleError'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'
import {
  getSizeForState,
  SETUP_ERROR_SIZE,
  DICTATION_PILL_SIZE,
} from '../../../hooks/useCapsuleResize'

vi.mock('../../../lib/tauri')

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
      <div className={className}>{children}</div>
    ),
  },
}))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.openSettingsPane).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('capsule setup messages', () => {
  it('shows "Set up" for a missing service and opens the right Settings pane', () => {
    useAppStore.getState().setPipelineError('Set up speech recognition first', 'stt')
    render(<CapsuleError />)

    expect(screen.getByText('Set up speech recognition first')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }))

    expect(tauri.openSettingsPane).toHaveBeenCalledWith('stt')
    expect(useAppStore.getState().pipelineError).toBeNull()
    expect(useAppStore.getState().pipelineErrorAction).toBeNull()
  })

  it('has no button for ordinary errors', () => {
    useAppStore.getState().setPipelineError('STT failed')
    render(<CapsuleError />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps a setup message longer than an ordinary error', () => {
    vi.useFakeTimers()
    useAppStore.getState().setPipelineError('Set up the AI polish service first', 'llm')
    render(<CapsuleError />)

    act(() => vi.advanceTimersByTime(3000))
    expect(useAppStore.getState().pipelineError).not.toBeNull()
    act(() => vi.advanceTimersByTime(3500))
    expect(useAppStore.getState().pipelineError).toBeNull()
  })

  it('makes the pill wide enough for the message and the button', () => {
    expect(getSizeForState('idle', false, true, false, null, true)).toEqual(SETUP_ERROR_SIZE)
    expect(getSizeForState('idle', false, true, false, null, false)).toEqual(DICTATION_PILL_SIZE)
  })
})
