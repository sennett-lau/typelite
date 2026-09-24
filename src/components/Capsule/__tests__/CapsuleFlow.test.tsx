import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    targets: ['en', 'zh', 'ja'],
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

  it('renders transcribing state with partial transcript when available', () => {
    useAppStore.setState({
      pipelineState: 'transcribing',
      partialTranscript: 'hello world',
    })

    render(<Capsule />)

    expect(screen.getByText(/hello world/)).toBeInTheDocument()
  })

  it('renders thinking state during polishing', () => {
    useAppStore.setState({ pipelineState: 'polishing' })

    render(<Capsule />)

    expect(screen.getByText('capsule.thinking')).toBeInTheDocument()
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

    expect(screen.getByText('ask.title')).toBeInTheDocument()
    expect(screen.getByText('ask.title')).toHaveClass('whitespace-nowrap')
    expect(screen.getByText('00:00')).toBeInTheDocument()

    const pointerUp = new Event('pointerup', { bubbles: true })
    Object.defineProperty(pointerUp, 'button', { value: 0 })
    fireEvent(screen.getByText('ask.title'), pointerUp)

    expect(stopAskFlow).toHaveBeenCalledTimes(1)
  })

  it('renders Ask thinking in the capsule', () => {
    useAppStore.setState({ pipelineState: 'ask_thinking' })

    render(<Capsule />)

    expect(screen.getByText('ask.title')).toBeInTheDocument()
    expect(screen.getByText('ask.title')).toHaveClass('whitespace-nowrap')
    expect(screen.getByText('ask.thinking')).toBeInTheDocument()
  })

  const translateConfig = () => ({
    ...useAppStore.getState().config,
    translation: { targets: ['en', 'zh', 'ja', 'fr'], active_target: 'en' },
  })

  it('shows three language chips only while Translate is recording', () => {
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
    expect(chips.map((chip) => chip.textContent)).toEqual(['EN', '中', '日'])
    expect(screen.getByRole('button', { name: 'translate.chipLabel English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'translate.chipLabel English' })).toHaveClass(
      'bg-pill-chip',
    )
    expect(screen.getByRole('button', { name: 'translate.chipLabel 中文' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    useAppStore.setState({ pipelineState: 'transcribing' })
    rerender(<Capsule />)
    expect(screen.queryByRole('group', { name: 'translate.chipsLabel' })).toBeNull()
  })

  it('switches the target on chip click without stopping or restarting recording', async () => {
    vi.mocked(setActiveTranslationTarget).mockResolvedValueOnce({
      targets: ['en', 'zh', 'ja', 'fr'],
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

    expect(shell().style.width).toBe('296px')
    expect(shell().style.height).toBe('36px')

    useAppStore.setState({ activeVoiceMode: 'dictate' })
    rerender(<Capsule />)
    expect(shell().style.width).toBe('216px')
  })

  it('shows the waveform while Ask is recording', () => {
    useAppStore.setState({ pipelineState: 'ask_recording' })

    const { container } = render(<Capsule />)

    expect(screen.getByTestId('waveform')).toBeInTheDocument()
    const shell = container.querySelector('.pill') as HTMLElement
    expect(shell.style.width).toBe('248px')
  })
})
