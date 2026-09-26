/**
 * Plan `typing-speed-and-nudge`: the typing nudge in the pill.
 */
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { useAppStore } from '../../../stores/appStore'
import { dismissTypingNudge } from '../../../lib/tauri'
import { Capsule } from '../index'
import { NUDGE_HOLD_MS } from '../CapsuleNudge'

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
  useTranslation: () => ({ t: translate }),
}))

vi.mock('../../../hooks/useCapsuleResize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useCapsuleResize')>()),
  useCapsuleResize: () => ({ width: 440, height: 40 }),
}))

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
  abortRecording: vi.fn().mockResolvedValue(undefined),
  copyOfferToClipboard: vi.fn().mockResolvedValue(undefined),
  dismissCopyOffer: vi.fn().mockResolvedValue(undefined),
  dismissTypingNudge: vi.fn().mockResolvedValue(undefined),
  setActiveTranslationTarget: vi.fn().mockResolvedValue(undefined),
  stopAskFlow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

const shell = () => screen.getByTestId('capsule-shell')

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState(useAppStore.getInitialState())
  useAppStore.getState().updateConfig({ hotkey: 'End' })
  useAppStore.setState({ typingNudge: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('typing nudge', () => {
  it('suggests the Dictate key on the glass pill', () => {
    render(<Capsule />)
    expect(shell()).toHaveAttribute('data-visible', 'true')
    expect(shell().className).toContain('pill-nudge')
    const nudge = screen.getByTestId('capsule-nudge')
    expect(nudge).toHaveTextContent('Typing a lot? Press End to say it instead.')
    expect(nudge.querySelector('kbd')).toHaveTextContent('End')
  })

  it('draws a chord as compact caps that read by full name (plan compact-key-labels)', () => {
    useAppStore.getState().updateConfig({ hotkey: 'End+RightControl' })
    render(<Capsule />)
    const caps = Array.from(screen.getByTestId('capsule-nudge').querySelectorAll('kbd'))
    expect(caps.map((kbd) => kbd.getAttribute('title'))).toEqual(['End', 'Right Control'])
    expect(caps.every((kbd) => kbd.classList.contains('pill-nudge-key'))).toBe(true)
    expect(caps[1].querySelector('[aria-hidden="true"]')?.textContent).toBe('⌃R')
    expect(caps[1].querySelector('.sr-only')?.textContent).toBe('Right Control')
  })

  it('"Don\'t show again" closes it for good', () => {
    render(<Capsule />)
    fireEvent.click(screen.getByRole('button', { name: "Don't show again" }))
    expect(useAppStore.getState().typingNudge).toBe(false)
    expect(dismissTypingNudge).toHaveBeenCalledWith(true)
    expect(shell()).toHaveAttribute('data-visible', 'false')
  })

  it('the close button hides it only for now', () => {
    render(<Capsule />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useAppStore.getState().typingNudge).toBe(false)
    expect(dismissTypingNudge).toHaveBeenCalledWith(false)
  })

  it('hides by itself after 8 s, paused while hovered', () => {
    render(<Capsule />)
    const nudge = screen.getByTestId('capsule-nudge')
    fireEvent.pointerEnter(nudge)
    act(() => {
      vi.advanceTimersByTime(NUDGE_HOLD_MS + 1000)
    })
    expect(useAppStore.getState().typingNudge).toBe(true)
    fireEvent.pointerLeave(nudge)
    act(() => {
      vi.advanceTimersByTime(NUDGE_HOLD_MS)
    })
    expect(useAppStore.getState().typingNudge).toBe(false)
    expect(dismissTypingNudge).toHaveBeenCalledWith(false)
  })

  it('a run replaces it and closes it', () => {
    render(<Capsule />)
    act(() => {
      useAppStore.setState({ pipelineState: 'recording' })
    })
    expect(screen.queryByTestId('capsule-nudge')).toBeNull()
    expect(useAppStore.getState().typingNudge).toBe(false)
  })
})
