import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../../stores/appStore'
import { cycleTranslationTarget, stopAskFlow } from '../../../lib/tauri'
import { Capsule } from '../index'

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
  useCapsuleResize: () => ({ width: 224, height: 32 }),
}))

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
  abortRecording: vi.fn().mockResolvedValue(undefined),
  cycleTranslationTarget: vi.fn().mockResolvedValue({
    targets: ['en', 'zh-Hant-HK', 'ja'],
    active_target: 'zh-Hant-HK',
  }),
  stopAskFlow: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState())
})

function insertedResult() {
  return { status: 'inserted', chars_inserted: 12 } as unknown as NonNullable<
    ReturnType<typeof useAppStore.getState>['lastInsertResult']
  >
}

describe('Capsule flow states', () => {
  beforeEach(() => {
    useAppStore.setState({
      pipelineState: 'idle',
      pipelineError: null,
      contextMenuOpen: false,
      contextMenuReady: false,
      activeVoiceMode: null,
      partialTranscript: '',
    })
  })

  it('renders preparing state', () => {
    useAppStore.setState({ pipelineState: 'preparing' })

    render(<Capsule />)

    expect(screen.getByText('capsule.preparing')).toBeInTheDocument()
  })

  it('shows a short label over the aurora sweep while transcribing, polishing and pasting', () => {
    useAppStore.setState({ pipelineState: 'transcribing', partialTranscript: 'hello world' })
    const { container, rerender } = render(<Capsule />)
    const shell = () => container.querySelector('.pill') as HTMLElement

    // The label only, never the partial transcript.
    expect(screen.getByText('capsule.transcribing')).toBeInTheDocument()
    expect(screen.queryByText(/hello world/)).toBeNull()
    expect(screen.getByTestId('capsule-aurora')).toHaveAttribute('data-mode', 'working')
    expect(shell().style.width).toBe('140px')

    useAppStore.setState({ pipelineState: 'polishing' })
    rerender(<Capsule />)
    expect(screen.getByText('capsule.polishing')).toBeInTheDocument()
    expect(shell().style.width).toBe('140px')

    useAppStore.setState({ pipelineState: 'outputting' })
    rerender(<Capsule />)
    expect(screen.getByText('capsule.pasting')).toBeInTheDocument()
    expect(shell().style.width).toBe('140px')
  })

  it('flashes done after pasting, then hides', () => {
    vi.useFakeTimers()
    try {
      useAppStore.setState({ pipelineState: 'outputting' })
      const { rerender } = render(<Capsule />)
      act(() => useAppStore.setState({ lastInsertResult: insertedResult() }))

      act(() => useAppStore.setState({ pipelineState: 'idle' }))
      rerender(<Capsule />)
      expect(screen.getByText('capsule.done')).toBeInTheDocument()
      expect(screen.getByTestId('capsule-aurora')).toHaveAttribute('data-mode', 'done')

      act(() => {
        vi.advanceTimersByTime(600)
      })
      // Plan `copy-when-no-field`: the pill slides away as it was (still "Done"), and its light
      // fades.
      expect(screen.getByTestId('capsule-shell')).toHaveClass('pill-gone')
      expect(screen.getByTestId('capsule-shell')).toHaveAttribute('data-visible', 'false')
      expect(screen.queryByTestId('capsule-aurora')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('flashes done when streaming output goes straight from polishing to idle', () => {
    useAppStore.setState({ pipelineState: 'polishing' })
    render(<Capsule />)
    act(() => useAppStore.setState({ lastInsertResult: insertedResult() }))
    act(() => useAppStore.setState({ pipelineState: 'idle' }))
    expect(screen.getByText('capsule.done')).toBeInTheDocument()
  })

  it('never shows the idle icon, and a cancelled run hides without done', () => {
    useAppStore.setState({ pipelineState: 'recording', activeVoiceMode: 'dictate' })
    const { container } = render(<Capsule />)
    act(() => useAppStore.setState({ pipelineState: 'transcribing' }))
    act(() => useAppStore.setState({ pipelineState: 'idle' }))
    expect(screen.queryByText('capsule.done')).toBeNull()
    expect(container.querySelector('svg circle, svg rect[x="8.5"]')).toBeNull()
  })

  it('shows no timer while recording or working', () => {
    for (const pipelineState of [
      'recording',
      'ask_recording',
      'transcribing',
      'polishing',
      'ask_thinking',
    ] as const) {
      useAppStore.setState({ pipelineState, activeVoiceMode: 'dictate' })
      const { container, unmount } = render(<Capsule />)
      expect(container.textContent ?? '').not.toMatch(/\d{1,2}:\d{2}/)
      unmount()
    }
  })

  it('uses the listening aurora and narrow pill while recording', () => {
    useAppStore.setState({ pipelineState: 'recording', activeVoiceMode: 'dictate' })
    const { container } = render(<Capsule />)

    expect(screen.getByTestId('capsule-aurora')).toHaveAttribute('data-mode', 'listening')
    expect((container.querySelector('.pill') as HTMLElement).style.width).toBe('160px')
  })

  it('does not start dictation when the idle capsule is clicked', () => {
    const { container } = render(<Capsule />)
    const shell = container.querySelector('.pill')
    expect(shell).toBeTruthy()

    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperty(pointerUp, 'button', { value: 0 })
    fireEvent(shell as Element, pointerUp)

    expect(invoke).not.toHaveBeenCalledWith('start_recording')
  })

  it('renders Ask recording in the capsule and stops Ask when clicked', () => {
    useAppStore.setState({ pipelineState: 'ask_recording' })

    render(<Capsule />)

    // The Ask name is for screen readers only; the pill shows the icon.
    expect(screen.getByText('ask.title')).toHaveClass('sr-only')

    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperty(pointerUp, 'button', { value: 0 })
    fireEvent(screen.getByText('ask.title'), pointerUp)

    expect(stopAskFlow).toHaveBeenCalledTimes(1)
  })

  it('renders Ask thinking in the capsule', () => {
    useAppStore.setState({ pipelineState: 'ask_thinking' })

    render(<Capsule />)

    expect(screen.getByText('ask.title')).toHaveClass('sr-only')
    expect(screen.getByText('ask.thinking')).toBeInTheDocument()
  })

  const translateConfig = () => ({
    ...useAppStore.getState().config,
    translation: { targets: ['en', 'zh-Hant-HK', 'ja'], active_target: 'en' },
  })

  const translateWith = (targets: string[], active_target: string) => ({
    ...useAppStore.getState().config,
    translation: { targets, active_target },
  })
  const languageName = () => document.querySelector('.pill-lang-name')
  const dots = () =>
    Array.from(screen.queryByTestId('translate-pill-dots')?.querySelectorAll('i') ?? [])

  it('shows the active language name and one dot per language only while Translate records', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'dictate',
      config: translateWith(['en', 'zh-Hant-HK', 'ja'], 'zh-Hant-HK'),
    })
    const { rerender } = render(<Capsule />)
    expect(languageName()).toBeNull()

    useAppStore.setState({ activeVoiceMode: 'translate' })
    rerender(<Capsule />)
    expect(languageName()).toHaveTextContent('translate.languages.zhHantHK')
    expect(dots()).toHaveLength(3)
    expect(dots().map((dot) => dot.classList.contains('pill-lang-dot-on'))).toEqual([
      false,
      true,
      false,
    ])
    expect(screen.getByRole('img', { name: 'translate.pillPosition' })).toBeInTheDocument()

    useAppStore.setState({ pipelineState: 'transcribing' })
    rerender(<Capsule />)
    expect(languageName()).toBeNull()
  })

  it('shows only the name, without dots, when one language is chosen', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateWith(['ja'], 'ja'),
    })
    render(<Capsule />)

    expect(languageName()).toHaveTextContent('日本語')
    expect(screen.queryByTestId('translate-pill-dots')).toBeNull()
  })

  it('switches to the next language when the name is clicked, without stopping', async () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateWith(['en', 'zh-Hant-HK', 'ja'], 'en'),
    })
    render(<Capsule />)

    const name = screen.getByRole('button', {
      name: 'translate.pillLanguage. translate.pillSwitchHint',
    })
    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperty(pointerUp, 'button', { value: 0 })
    fireEvent.pointerDown(name)
    fireEvent(name, pointerUp)
    // Pressing the name does not move focus into the pill.
    expect(fireEvent.mouseDown(name)).toBe(false)
    fireEvent.click(name)

    await waitFor(() => expect(cycleTranslationTarget).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(useAppStore.getState().config.translation.active_target).toBe('zh-Hant-HK'),
    )
    expect(invoke).not.toHaveBeenCalledWith('stop_recording')
    expect(invoke).not.toHaveBeenCalledWith('start_recording')
    expect(languageName()).toHaveTextContent('translate.languages.zhHantHK')
    expect(dots().map((dot) => dot.classList.contains('pill-lang-dot-on'))).toEqual([
      false,
      true,
      false,
    ])

    // A click elsewhere on the pill still stops the recording.
    const elsewhere = new Event('pointerup', { bubbles: true })
    Object.defineProperty(elsewhere, 'button', { value: 0 })
    fireEvent(screen.getByTestId('waveform'), elsewhere)
    expect(invoke).toHaveBeenCalledWith('stop_recording')
  })

  it('does not make a single language name clickable', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateWith(['ja'], 'ja'),
    })
    render(<Capsule />)

    expect(languageName()?.tagName).toBe('SPAN')
    expect(screen.queryByRole('button', { name: /pillSwitchHint/ })).toBeNull()
  })

  it('shows no name when no language is chosen', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateWith([], 'en'),
    })
    const { container } = render(<Capsule />)

    expect(languageName()).toBeNull()
    expect(screen.queryByTestId('translate-pill-dots')).toBeNull()
    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    expect((container.querySelector('.pill') as HTMLElement).style.width).toBe('160px')
  })

  it('resizes the shell to the new name when the language changes during a recording', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateWith(['en', 'zh-Hant-HK'], 'en'),
    })
    const { container, rerender } = render(<Capsule />)
    const shell = () => container.querySelector('.pill') as HTMLElement
    // 'English' (about 48 pt in tests) and two dots.
    expect(shell().style.width).toBe('226px')
    expect(shell()).not.toHaveClass('pill-size-instant')

    // The long name is capped at 180 pt; the CSS on `.pill` animates the width change.
    act(() => useAppStore.setState({ config: translateWith(['en', 'zh-Hant-HK'], 'zh-Hant-HK') }))
    rerender(<Capsule />)
    expect(shell().style.width).toBe('358px')
    expect(shell()).not.toHaveClass('pill-size-instant')
    expect(languageName()).toHaveAttribute('data-display', 'ellipsis')
  })

  it('widens the capsule shell for the language while Translate is recording', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateConfig(),
    })
    const { container, rerender } = render(<Capsule />)
    const shell = () => container.querySelector('.pill') as HTMLElement

    // 'English' (about 48 pt in tests) and three dots.
    expect(shell().style.width).toBe('235px')
    expect(shell().style.height).toBe('32px')

    useAppStore.setState({ activeVoiceMode: 'dictate' })
    rerender(<Capsule />)
    expect(shell().style.width).toBe('160px')
  })

  it('shows the waveform while Ask is recording', () => {
    useAppStore.setState({ pipelineState: 'ask_recording' })

    const { container } = render(<Capsule />)

    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    const shell = container.querySelector('.pill') as HTMLElement
    expect(shell.style.width).toBe('160px')
  })
})
