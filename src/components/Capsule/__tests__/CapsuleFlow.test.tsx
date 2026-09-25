import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore } from '../../../stores/appStore'
import { setActiveTranslationTarget, stopAskFlow } from '../../../lib/tauri'
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
  useCapsuleResize: () => ({ width: 216, height: 36 }),
}))

vi.mock('../../../lib/tauri', () => ({
  abortAskDictation: vi.fn().mockResolvedValue(undefined),
  abortRecording: vi.fn().mockResolvedValue(undefined),
  setActiveTranslationTarget: vi.fn().mockResolvedValue({
    targets: ['en', 'zh-Hans', 'ja'],
    active_target: 'ja',
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
    expect(shell().style.width).toBe('132px')

    useAppStore.setState({ pipelineState: 'polishing' })
    rerender(<Capsule />)
    expect(screen.getByText('capsule.polishing')).toBeInTheDocument()
    expect(shell().style.width).toBe('132px')

    useAppStore.setState({ pipelineState: 'outputting' })
    rerender(<Capsule />)
    expect(screen.getByText('capsule.pasting')).toBeInTheDocument()
    expect(shell().style.width).toBe('132px')
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
    expect((container.querySelector('.pill') as HTMLElement).style.width).toBe('150px')
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

  it('shows one chip per chosen language only while Translate is recording', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'dictate',
      config: translateConfig(),
    })
    const { rerender } = render(<Capsule />)

    expect(screen.queryByRole('group', { name: 'translate.chipsLabel' })).toBeNull()

    useAppStore.setState({ activeVoiceMode: 'translate' })
    rerender(<Capsule />)
    const chips = within(screen.getByRole('group', { name: 'translate.chipsLabel' })).getAllByRole(
      'button',
    )
    expect(chips.map((chip) => chip.textContent)).toEqual(['EN', '港', '日'])
    expect(screen.getByRole('button', { name: 'translate.chipLabel English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'translate.chipLabel English' })).toHaveClass(
      'bg-pill-chip',
    )
    expect(
      screen.getByRole('button', { name: 'translate.chipLabel translate.languages.zhHantHK' }),
    ).toHaveAttribute('aria-pressed', 'false')

    useAppStore.setState({ pipelineState: 'transcribing' })
    rerender(<Capsule />)
    expect(screen.queryByRole('group', { name: 'translate.chipsLabel' })).toBeNull()
  })

  it('shows the language name and no chips when only one language is chosen', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: {
        ...useAppStore.getState().config,
        translation: { targets: ['ja'], active_target: 'ja' },
      },
    })
    const { container } = render(<Capsule />)

    expect(screen.queryByRole('group', { name: 'translate.chipsLabel' })).toBeNull()
    expect(screen.getByText('日本語')).toBeInTheDocument()
    expect((container.querySelector('.pill') as HTMLElement).style.width).toBe('232px')
  })

  it('switches the target on chip click without stopping or restarting recording', async () => {
    vi.mocked(setActiveTranslationTarget).mockResolvedValueOnce({
      targets: ['en', 'zh-Hant-HK', 'ja'],
      active_target: 'ja',
    })
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateConfig(),
    })
    render(<Capsule />)

    const japanese = screen.getByRole('button', { name: 'translate.chipLabel 日本語' })
    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperty(pointerUp, 'button', { value: 0 })
    fireEvent.pointerDown(japanese)
    fireEvent(japanese, pointerUp)
    fireEvent.click(japanese)

    await waitFor(() => expect(setActiveTranslationTarget).toHaveBeenCalledWith('ja'))
    expect(invoke).not.toHaveBeenCalledWith('stop_recording')
    expect(invoke).not.toHaveBeenCalledWith('start_recording')
    await waitFor(() => expect(useAppStore.getState().config.translation.active_target).toBe('ja'))
    expect(screen.getByRole('button', { name: 'translate.chipLabel 日本語' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('widens the capsule shell for the chips while Translate is recording', () => {
    useAppStore.setState({
      pipelineState: 'recording',
      activeVoiceMode: 'translate',
      config: translateConfig(),
    })
    const { container, rerender } = render(<Capsule />)
    const shell = () => container.querySelector('.pill') as HTMLElement

    expect(shell().style.width).toBe('232px')
    expect(shell().style.height).toBe('36px')

    useAppStore.setState({ activeVoiceMode: 'dictate' })
    rerender(<Capsule />)
    expect(shell().style.width).toBe('150px')
  })

  it('shows the waveform while Ask is recording', () => {
    useAppStore.setState({ pipelineState: 'ask_recording' })

    const { container } = render(<Capsule />)

    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    const shell = container.querySelector('.pill') as HTMLElement
    expect(shell.style.width).toBe('150px')
  })
})
