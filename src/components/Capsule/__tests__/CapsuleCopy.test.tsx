import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../stores/appStore'
import { copyOfferToClipboard, dismissCopyOffer, abortRecording } from '../../../lib/tauri'
import { Capsule } from '../index'
import { COPIED_HIDE_MS, COPY_PILL_HOLD_MS } from '../CapsuleCopy'

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
          React.createElement(tag, props, children),
    },
  ),
  useReducedMotion: () => true,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../../hooks/useCapsuleResize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useCapsuleResize')>()),
  useCapsuleResize: () => ({ width: 360, height: 36 }),
}))

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
  abortRecording: vi.fn().mockResolvedValue(undefined),
  copyOfferToClipboard: vi.fn().mockResolvedValue(undefined),
  dismissCopyOffer: vi.fn().mockResolvedValue(undefined),
  setActiveTranslationTarget: vi.fn().mockResolvedValue(undefined),
  stopAskFlow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

const LONG =
  "Let's meet at 4 pm tomorrow in the second-floor room. Please bring the updated budget."

function offer(text = LONG, targetLang: string | null = null) {
  return { text, targetLang }
}

const shell = () => screen.getByTestId('capsule-shell')

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({ pipelineState: 'idle', pipelineError: null, copyOffer: null })
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
})

describe('Copy pill', () => {
  it('shows the start of the result and a Copy button, one line wide', () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    expect(screen.getByTestId('capsule-copy')).toBeInTheDocument()
    expect(screen.getByText(LONG)).toHaveClass('truncate')
    expect(screen.getByRole('button', { name: 'capsule.copyResult' })).toBeInTheDocument()
    expect(screen.getByTestId('capsule-copy-countdown')).toHaveAttribute('pathLength', '100')
    expect(shell().style.width).toBe('360px')
    expect(shell().style.height).toBe('36px')
    expect(shell()).not.toHaveClass('pill-gone')
    // No aurora light behind the Copy pill.
    expect(screen.queryByTestId('capsule-aurora')).toBeNull()
  })

  it('uses the narrower pill for a short result and shows the language of a translation', () => {
    useAppStore.setState({ copyOffer: offer('我哋聽日四點開會。', 'ja') })
    render(<Capsule />)

    expect(shell().style.width).toBe('300px')
    expect(screen.getByText('日')).toHaveClass('pill-lang')
  })

  it('closes itself after 8 seconds', () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    act(() => vi.advanceTimersByTime(COPY_PILL_HOLD_MS - 100))
    expect(useAppStore.getState().copyOffer).not.toBeNull()
    expect(dismissCopyOffer).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(200))
    expect(useAppStore.getState().copyOffer).toBeNull()
    expect(dismissCopyOffer).toHaveBeenCalledTimes(1)
    expect(shell()).toHaveClass('pill-gone')
  })

  it('pauses the countdown while hovered and continues where it left off', () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    act(() => vi.advanceTimersByTime(5000))
    fireEvent.pointerEnter(screen.getByTestId('capsule-copy'))
    act(() => vi.advanceTimersByTime(20_000))
    expect(useAppStore.getState().copyOffer).not.toBeNull()

    fireEvent.pointerLeave(screen.getByTestId('capsule-copy'))
    act(() => vi.advanceTimersByTime(2900))
    expect(useAppStore.getState().copyOffer).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(useAppStore.getState().copyOffer).toBeNull()
  })

  it('copies through the backend, shows Copied, then hides about a second later', async () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'capsule.copyResult' }))
    })
    expect(copyOfferToClipboard).toHaveBeenCalledTimes(1)
    expect(screen.getByText('capsule.copied')).toBeInTheDocument()
    // The countdown ring is gone and no longer runs.
    expect(screen.queryByTestId('capsule-copy-countdown')).toBeNull()

    act(() => vi.advanceTimersByTime(COPIED_HIDE_MS - 100))
    expect(useAppStore.getState().copyOffer).not.toBeNull()
    act(() => vi.advanceTimersByTime(200))
    expect(useAppStore.getState().copyOffer).toBeNull()
    expect(shell()).toHaveClass('pill-gone')
    // A click on Copy is not a click on the pill (which would stop a recording).
    expect(abortRecording).not.toHaveBeenCalled()
  })

  it('hides when Escape closed it in the backend, and its countdown stops', () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    // The native Escape handler closes the offer and the backend sends `null`.
    act(() => useAppStore.getState().setCopyOffer(null))
    expect(shell()).toHaveClass('pill-gone')
    // It slides away as it was.
    expect(screen.getByTestId('capsule-copy')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(COPY_PILL_HOLD_MS * 2))
    expect(dismissCopyOffer).not.toHaveBeenCalled()
  })

  it('closes when a new run starts', () => {
    useAppStore.setState({ copyOffer: offer() })
    render(<Capsule />)

    act(() => useAppStore.setState({ pipelineState: 'ask_recording' }))
    expect(useAppStore.getState().copyOffer).toBeNull()
    expect(dismissCopyOffer).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('capsule-copy')).toBeNull()
  })

  it('does not start a countdown of an older offer for a newer one', () => {
    useAppStore.setState({ copyOffer: offer('first') })
    render(<Capsule />)
    act(() => vi.advanceTimersByTime(6000))

    act(() => useAppStore.setState({ copyOffer: offer('second') }))
    expect(screen.getByText('second')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(6000))
    expect(useAppStore.getState().copyOffer?.text).toBe('second')
    act(() => vi.advanceTimersByTime(2100))
    expect(useAppStore.getState().copyOffer).toBeNull()
  })
})
