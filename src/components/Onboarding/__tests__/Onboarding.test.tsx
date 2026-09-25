import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Onboarding, TOTAL_STEPS } from '../index'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

vi.mock('../OnboardingLayout', () => ({
  OnboardingLayout: ({
    children,
    onBack,
    onNext,
    totalSteps,
    canNext,
    canBack,
    nextLabel,
    title,
    onClose,
    centerContent,
  }: {
    children: React.ReactNode
    onBack: () => void
    onNext: () => void
    totalSteps: number
    canNext: boolean
    canBack: boolean
    nextLabel: string
    title: string
    onClose?: () => void
    centerContent?: boolean
  }) => (
    <div
      data-testid="layout"
      data-total-steps={totalSteps}
      data-can-next={String(canNext)}
      data-centered={String(Boolean(centerContent))}
    >
      <h1>{title}</h1>
      {onClose && (
        <button type="button" onClick={onClose}>
          Close tour
        </button>
      )}
      <button type="button" onClick={onBack} disabled={!canBack}>
        Back
      </button>
      <button type="button" onClick={onNext} disabled={!canNext}>
        {nextLabel}
      </button>
      {children}
    </div>
  ),
}))

const permissionsState = { allGranted: false }
vi.mock('../usePermissions', () => ({
  usePermissions: () => ({
    statuses: {},
    errors: {},
    busy: {},
    allGranted: permissionsState.allGranted,
    grant: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('../WelcomeStep', () => ({
  WelcomeStep: ({ onSkip }: { onSkip: () => void }) => (
    <div>
      Welcome step
      <button type="button" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  ),
}))
vi.mock('../MicrophoneStep', () => ({ MicrophoneStep: () => <div>Microphone step</div> }))
vi.mock('../SttSetupStep', () => ({
  SttSetupStep: ({ onSkip }: { onSkip: () => void }) => (
    <div>
      Speech step
      <button type="button" onClick={onSkip}>
        Skip speech
      </button>
    </div>
  ),
}))
vi.mock('../LlmSetupStep', () => ({
  LlmSetupStep: ({ onSkip }: { onSkip: () => void }) => (
    <div>
      AI step
      <button type="button" onClick={onSkip}>
        Skip AI
      </button>
    </div>
  ),
}))
vi.mock('../ShortcutStep', () => ({
  ShortcutStep: ({ role, done, onDone }: { role: string; done: boolean; onDone: () => void }) => (
    <div>
      Shortcut step {role} {done ? 'done' : 'pending'}
      <button type="button" onClick={onDone}>
        Complete {role}
      </button>
    </div>
  ),
}))

function layout() {
  return screen.getByTestId('layout')
}

/** Marks the active speech and/or AI preset as passed a Test. */
function setReady(speech: boolean, ai: boolean) {
  const config = useAppStore.getState().config
  useAppStore.getState().setConfig({
    ...config,
    speech_presets: config.speech_presets.map((preset, index) =>
      index === 0 ? { ...preset, verified_at: speech ? 1 : null } : preset,
    ),
    ai_presets: config.ai_presets.map((preset, index) =>
      index === 0 ? { ...preset, verified_at: ai ? 1 : null } : preset,
    ),
  })
}

function goToStep(step: number) {
  act(() => useAppStore.getState().setOnboardingStep(step))
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  permissionsState.allGranted = false
  vi.mocked(tauri.getConfig).mockResolvedValue(useAppStore.getState().config)
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.saveOnboardingCompleted).mockResolvedValue(undefined)
  vi.mocked(tauri.setShortcutTourState).mockResolvedValue(undefined)
  window.location.hash = '#/settings'
})

afterEach(() => cleanup())

describe('Onboarding flow', () => {
  it('has seven steps in the agreed order', () => {
    expect(TOTAL_STEPS).toBe(7)
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-total-steps', '7')

    const expected = [
      ['Welcome', 'Welcome step'],
      ['Voice input', 'Microphone step'],
      ['Speech recognition', 'Speech step'],
      ['AI Polish Service', 'AI step'],
      ['Dictate', 'Shortcut step dictation pending'],
      ['Translate', 'Shortcut step translate pending'],
      ['Ask Anything', 'Shortcut step ask pending'],
    ]
    expected.forEach(([title, content], step) => {
      goToStep(step)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText(content)).toBeInTheDocument()
    })
  })

  it('loads the saved config when it opens', async () => {
    const saved = { ...useAppStore.getState().config, input_device: 'USB Mic' }
    vi.mocked(tauri.getConfig).mockResolvedValue(saved)
    render(<Onboarding />)

    await waitFor(() => expect(useAppStore.getState().config.input_device).toBe('USB Mic'))
  })

  it('unlocks Next on the welcome step only when all permissions are granted', () => {
    const { rerender } = render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'false')

    permissionsState.allGranted = true
    rerender(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'true')
  })

  it('"Skip for now" moves on without the permissions', async () => {
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(1))
  })

  it('never blocks the microphone step', () => {
    useAppStore.setState({ onboardingStep: 1 })
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'true')
  })

  it('centres only the welcome step', () => {
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-centered', 'true')
    goToStep(1)
    expect(layout()).toHaveAttribute('data-centered', 'false')
  })

  it('unlocks Next on the service steps once the active preset passed a test', () => {
    useAppStore.setState({ onboardingStep: 2 })
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'false')
    act(() => setReady(true, false))
    expect(layout()).toHaveAttribute('data-can-next', 'true')

    goToStep(3)
    expect(layout()).toHaveAttribute('data-can-next', 'false')
    act(() => setReady(true, true))
    expect(layout()).toHaveAttribute('data-can-next', 'true')
  })

  it('"Skip for now" on the speech step moves on to the AI step', async () => {
    useAppStore.setState({ onboardingStep: 2 })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip speech' }))

    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(3))
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })

  it('skipping the AI step finishes onboarding and opens Home', async () => {
    useAppStore.setState({ onboardingStep: 3 })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip AI' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(tauri.saveOnboardingCompleted).toHaveBeenCalled()
    expect(tauri.updateConfig).toHaveBeenCalled()
    expect(tauri.setShortcutTourState).not.toHaveBeenCalled()
    expect(useAppStore.getState().config.shortcut_tour_completed).toBe(false)
    expect(window.location.hash).toBe('#/')
  })

  it('after the AI step, finishes when speech is not ready even though AI is', async () => {
    act(() => setReady(false, true))
    useAppStore.setState({ onboardingStep: 3 })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(useAppStore.getState().onboardingStep).toBe(3)
  })

  it('after the AI step, continues to the shortcut steps when both are ready', async () => {
    act(() => setReady(true, true))
    useAppStore.setState({ onboardingStep: 3 })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(4))
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })

  it('unlocks each shortcut step once its practice worked, and keeps it after Back', async () => {
    useAppStore.setState({ onboardingStep: 4 })
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Complete dictation' }))
    expect(layout()).toHaveAttribute('data-can-next', 'true')
    expect(screen.getByText('Shortcut step dictation done')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(5))
    expect(layout()).toHaveAttribute('data-can-next', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(4))
    expect(layout()).toHaveAttribute('data-can-next', 'true')
    expect(tauri.updateConfig).toHaveBeenCalled()
  })

  it('finishes on the Ask step and marks onboarding completed', async () => {
    useAppStore.setState({ onboardingStep: 6 })
    render(<Onboarding />)

    const finish = screen.getByRole('button', { name: 'Finish' })
    expect(finish).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Complete ask' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(tauri.saveOnboardingCompleted).toHaveBeenCalled()
    expect(tauri.setShortcutTourState).toHaveBeenCalledWith({ completed: true })
    expect(useAppStore.getState().config.shortcut_tour_completed).toBe(true)
  })

  it('the shortcut tour starts at Dictate, cannot go back, and closes to Home', async () => {
    useAppStore.getState().startShortcutTour()
    render(<Onboarding />)

    expect(screen.getByText('Shortcut step dictation pending')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Close tour' }))

    expect(useAppStore.getState().onboardingCompleted).toBe(true)
    expect(useAppStore.getState().onboardingTour).toBe(false)
  })

  it('shows the error and stays when saving on Finish fails', async () => {
    vi.mocked(tauri.updateConfig).mockRejectedValue('disk full')
    useAppStore.setState({ onboardingStep: 6 })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Complete ask' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(await screen.findByText('Could not save: disk full')).toBeInTheDocument()
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })
})
