// Plan `quiet-no-speech`: a run that heard no speech ends with the calm fade, not the red pill.
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../stores/appStore'
import { Capsule, QUIET_MS } from '../index'

const motionState = vi.hoisted(() => ({ reduced: false }))

// Framer Motion without animation: children render at once, and each element shows the target it
// would animate to (`data-animate`), so the drain can be checked.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({
          children,
          initial: _initial,
          animate,
          exit: _exit,
          ...props
        }: Record<string, unknown> & { children?: React.ReactNode }) =>
          React.createElement(tag, { ...props, 'data-animate': JSON.stringify(animate) }, children),
    },
  ),
  useReducedMotion: () => motionState.reduced,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../../hooks/useCapsuleResize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useCapsuleResize')>()),
  useCapsuleResize: () => ({ width: 104, height: 32 }),
}))

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
  abortRecording: vi.fn().mockResolvedValue(undefined),
  dismissCopyOffer: vi.fn().mockResolvedValue(undefined),
  openSettingsPane: vi.fn().mockResolvedValue(undefined),
  stopAskFlow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

const shell = () => screen.getByTestId('capsule-shell')
const lights = () =>
  screen.queryAllByTestId('capsule-aurora').map((light) => ({
    mode: light.getAttribute('data-mode'),
    draining: light.getAttribute('data-draining') === 'true',
  }))
const set = (patch: Partial<ReturnType<typeof useAppStore.getState>>) =>
  act(() => useAppStore.setState(patch))

/** What the backend sends for Dictate and Translate: the no-speech error, then idle. */
function endWithNoSpeech() {
  set({ quietFade: true })
  set({ pipelineState: 'idle' })
}

beforeEach(() => {
  vi.useFakeTimers()
  motionState.reduced = false
  useAppStore.setState(useAppStore.getInitialState())
  useAppStore.setState({ activeVoiceMode: 'dictate' })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('calm fade (plan `quiet-no-speech`)', () => {
  it('shows no text and no red: the pill narrows to 104 pt while the sweep drains to grey', () => {
    set({ pipelineState: 'transcribing' })
    render(<Capsule />)

    // The error comes first; the pill stays on "Transcribing" until the run is idle.
    set({ quietFade: true })
    expect(screen.getByText('capsule.transcribing')).toBeInTheDocument()

    set({ pipelineState: 'idle' })
    expect(shell()).toHaveAttribute('data-visible', 'true')
    expect(shell()).not.toHaveClass('pill-error')
    expect(shell()).not.toHaveClass('pill-gone')
    expect(shell().style.width).toBe('104px')
    expect(shell().style.height).toBe('32px')
    expect(shell().textContent).toBe('')

    // The sweep stays and drains (grey, a little brighter, a faint trace) under a grey flash.
    expect(lights()).toEqual([
      { mode: 'working', draining: true },
      { mode: 'quiet', draining: false },
    ])
    const sweep = screen.getAllByTestId('capsule-aurora')[0]
    expect(sweep).toHaveClass('aurora-draining')
    expect(JSON.parse(sweep.parentElement?.dataset.animate ?? '{}')).toMatchObject({
      opacity: 0.2,
      filter: 'saturate(0) brightness(1.35)',
    })
    expect(document.querySelector('.aurora-quiet')).not.toBeNull()
  })

  it('hides after QUIET_MS and clears what the recording left', () => {
    set({ pipelineState: 'transcribing', partialTranscript: 'hmm', audioVolume: 0.2 })
    render(<Capsule />)
    endWithNoSpeech()

    act(() => vi.advanceTimersByTime(QUIET_MS - 1))
    expect(shell()).toHaveAttribute('data-visible', 'true')
    expect(useAppStore.getState().quietFade).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(useAppStore.getState().quietFade).toBe(false)
    // The normal hide: it slides away as it was, empty and 104 pt, and its light goes.
    expect(shell()).toHaveClass('pill-gone')
    expect(shell()).toHaveAttribute('data-visible', 'false')
    expect(shell().style.width).toBe('104px')
    expect(lights()).toEqual([])
    expect(useAppStore.getState().partialTranscript).toBe('')
    expect(useAppStore.getState().audioVolume).toBe(0)
  })

  it('also fades when Ask reports idle just before no speech, narrowing from the pill shown', () => {
    set({ pipelineState: 'ask_thinking', activeVoiceMode: 'ask' })
    render(<Capsule />)

    set({ pipelineState: 'idle' })
    expect(shell()).toHaveAttribute('data-visible', 'false')

    set({ quietFade: true })
    expect(shell()).toHaveAttribute('data-visible', 'true')
    expect(shell().style.width).toBe('104px')
    // Not a fresh appearance: the width animates from the Ask pill instead of jumping.
    expect(shell()).not.toHaveClass('pill-size-instant')
    expect(lights()).toEqual([
      { mode: 'working', draining: true },
      { mode: 'quiet', draining: false },
    ])
  })

  it('drains the glow when a recording ends with no speech, and nothing after preparing', () => {
    set({ pipelineState: 'recording' })
    const { unmount } = render(<Capsule />)
    endWithNoSpeech()
    expect(lights()).toEqual([
      { mode: 'listening', draining: true },
      { mode: 'quiet', draining: false },
    ])
    unmount()

    // Stopped while still preparing: there was no light to drain, so only the flash shows.
    useAppStore.setState({ pipelineState: 'preparing', quietFade: false })
    render(<Capsule />)
    endWithNoSpeech()
    expect(lights()).toEqual([{ mode: 'quiet', draining: false }])
    expect(shell().style.width).toBe('104px')
  })

  it('gives way at once to a new recording', () => {
    set({ pipelineState: 'transcribing' })
    render(<Capsule />)
    endWithNoSpeech()

    // Even before the fade is cleared, a live run wins.
    set({ pipelineState: 'recording', audioVolume: 0.4 })
    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    expect(shell().style.width).toBe('160px')
    expect(lights()).toEqual([{ mode: 'listening', draining: false }])
    expect(
      JSON.parse(screen.getByTestId('capsule-aurora').parentElement?.dataset.animate ?? '{}'),
    ).toMatchObject({ opacity: 1, filter: 'none' })

    // The fade's own timer ends it without touching the new run.
    act(() => vi.advanceTimersByTime(QUIET_MS))
    expect(useAppStore.getState().quietFade).toBe(false)
    expect(shell()).toHaveAttribute('data-visible', 'true')
    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    expect(useAppStore.getState().audioVolume).toBe(0.4)
  })

  it('keeps the red error pill for real errors', () => {
    set({ pipelineState: 'transcribing' })
    render(<Capsule />)

    set({ pipelineError: "Can't reach the speech server" })
    set({ pipelineState: 'idle' })
    expect(shell()).toHaveClass('pill-error')
    expect(shell().style.width).toBe('224px')
    expect(screen.getByText("Can't reach the speech server")).toBeInTheDocument()
    expect(lights()).toEqual([])
  })

  it('has no drain and no flash with reduced motion; the pill only fades', () => {
    motionState.reduced = true
    set({ pipelineState: 'transcribing' })
    render(<Capsule />)
    endWithNoSpeech()

    expect(shell().style.width).toBe('104px')
    expect(shell().textContent).toBe('')
    expect(lights()).toEqual([])

    act(() => vi.advanceTimersByTime(QUIET_MS))
    expect(shell()).toHaveClass('pill-gone')
  })
})
