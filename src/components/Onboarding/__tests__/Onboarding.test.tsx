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
    subtitle,
    onClose,
    onSkip,
  }: {
    children: React.ReactNode
    onBack: () => void
    onNext: () => void
    totalSteps: number
    canNext: boolean
    canBack: boolean
    nextLabel: string
    title: string
    subtitle?: string
    onClose?: () => void
    onSkip?: () => void
  }) => (
    <div data-testid="layout" data-total-steps={totalSteps} data-can-next={String(canNext)}>
      <h1>{title}</h1>
      {subtitle && <p data-testid="subtitle">{subtitle}</p>}
      {onClose && (
        <button type="button" onClick={onClose}>
          Close tour
        </button>
      )}
      <button type="button" onClick={onBack} disabled={!canBack}>
        Back
      </button>
      {onSkip && (
        <button type="button" onClick={onSkip}>
          Skip
        </button>
      )}
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
vi.mock('../ShortcutSetupPage', () => ({
  ShortcutSetupPage: ({ role }: { role: string }) => <div>Setup page {role}</div>,
}))
vi.mock('../ExercisePage', () => ({
  ExercisePage: ({ exercise, onPassed }: { exercise: { id: string }; onPassed: () => void }) => (
    <div>
      Exercise page {exercise.id}
      <button type="button" onClick={onPassed}>
        Pass {exercise.id}
      </button>
    </div>
  ),
}))

/** Step index of each shortcut page (plan `tutorial-one-page`). */
const PAGE = {
  dictateSetup: 4,
  correction: 5,
  fillers: 6,
  translateSetup: 7,
  speakTranslate: 8,
  selectionTranslate: 9,
  askSetup: 10,
  question: 11,
  edit: 12,
}

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
  it('has the four setup steps, then a setup page and two exercise pages per shortcut', () => {
    expect(TOTAL_STEPS).toBe(13)
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-total-steps', '13')

    const expected = [
      ['Welcome', 'Welcome step'],
      ['Voice input', 'Microphone step'],
      ['Speech recognition', 'Speech step'],
      ['AI polish', 'AI step'],
      ['Dictate', 'Setup page dictation'],
      ['Change your mind', 'Exercise page correction'],
      ['Fillers disappear', 'Exercise page fillers'],
      ['Translate', 'Setup page translate'],
      ['Speak and translate', 'Exercise page speakTranslate'],
      ['Translate a selection', 'Exercise page selectionTranslate'],
      ['Ask Anything', 'Setup page ask'],
      ['Ask a question', 'Exercise page question'],
      ['Edit by voice', 'Exercise page edit'],
    ]
    expected.forEach(([title, content], step) => {
      goToStep(step)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText(content)).toBeInTheDocument()
    })
  })

  it('subtitles each exercise with its shortcut and number', () => {
    useAppStore.setState({ onboardingStep: PAGE.fillers })
    render(<Onboarding />)
    expect(screen.getByTestId('subtitle')).toHaveTextContent('Dictate · exercise 2 of 2')
    goToStep(PAGE.dictateSetup)
    expect(screen.getByTestId('subtitle')).toHaveTextContent(
      'Speak, and get clean text in any app.',
    )
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

    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.dictateSetup))
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })

  it('offers "Try it" on a setup page once the shortcut is set', async () => {
    useAppStore.setState({ onboardingStep: PAGE.dictateSetup })
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'true')
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try it' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.correction))
  })

  it('keeps "Try it" off on the Translate setup page until a language is added', () => {
    useAppStore.getState().updateConfig({ translation: { targets: [], active_target: '' } })
    useAppStore.setState({ onboardingStep: PAGE.translateSetup })
    render(<Onboarding />)
    expect(screen.getByRole('button', { name: 'Try it' })).toBeDisabled()

    act(() =>
      useAppStore
        .getState()
        .updateConfig({ translation: { targets: ['ja'], active_target: 'ja' } }),
    )
    expect(screen.getByRole('button', { name: 'Try it' })).toBeEnabled()
  })

  it('unlocks Next on an exercise once it passed, hides Skip, and keeps it after Back', async () => {
    useAppStore.setState({ onboardingStep: PAGE.correction })
    render(<Onboarding />)
    expect(layout()).toHaveAttribute('data-can-next', 'false')
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pass correction' }))
    expect(layout()).toHaveAttribute('data-can-next', 'true')
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.fillers))
    expect(layout()).toHaveAttribute('data-can-next', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.correction))
    expect(layout()).toHaveAttribute('data-can-next', 'true')
    expect(tauri.updateConfig).toHaveBeenCalled()
  })

  it('Skip moves on to the next page without passing the exercise', async () => {
    useAppStore.setState({ onboardingStep: PAGE.fillers })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.translateSetup))

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(useAppStore.getState().onboardingStep).toBe(PAGE.fillers))
    expect(layout()).toHaveAttribute('data-can-next', 'false')
  })

  it('finishes on the last exercise and marks onboarding completed', async () => {
    useAppStore.setState({ onboardingStep: PAGE.edit })
    render(<Onboarding />)

    const finish = screen.getByRole('button', { name: 'Finish' })
    expect(finish).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Pass edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(tauri.saveOnboardingCompleted).toHaveBeenCalled()
    expect(tauri.setShortcutTourState).toHaveBeenCalledWith({ completed: true })
    expect(useAppStore.getState().config.shortcut_tour_completed).toBe(true)
  })

  it('skipping the last exercise also finishes the tour', async () => {
    useAppStore.setState({ onboardingStep: PAGE.edit })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(tauri.setShortcutTourState).toHaveBeenCalledWith({ completed: true })
  })

  it('the shortcut tour starts at Dictate, cannot go back, and closes to Home', async () => {
    useAppStore.getState().startShortcutTour()
    render(<Onboarding />)

    expect(screen.getByText('Setup page dictation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Close tour' }))

    expect(useAppStore.getState().onboardingCompleted).toBe(true)
    expect(useAppStore.getState().onboardingTour).toBe(false)
  })

  it('shows the error and stays when saving on Finish fails', async () => {
    vi.mocked(tauri.updateConfig).mockRejectedValue('disk full')
    useAppStore.setState({ onboardingStep: PAGE.edit })
    render(<Onboarding />)

    fireEvent.click(screen.getByRole('button', { name: 'Pass edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(await screen.findByText('Could not save: disk full')).toBeInTheDocument()
    expect(useAppStore.getState().onboardingCompleted).toBe(false)
  })
})

describe('Onboarding shortcut gate (plan onboarding-shortcut-gate)', () => {
  const lastGate = () => vi.mocked(tauri.setShortcutGate).mock.lastCall?.[0]

  beforeEach(() => {
    vi.mocked(tauri.setShortcutGate).mockResolvedValue(undefined)
  })

  it('allows no shortcut on the welcome, microphone, speech and AI steps', async () => {
    render(<Onboarding />)
    await waitFor(() => expect(tauri.setShortcutGate).toHaveBeenCalledWith([]))
    for (const step of [1, 2, 3]) {
      goToStep(step)
      expect(lastGate()).toEqual([])
    }
    expect(tauri.setShortcutGate).not.toHaveBeenCalledWith('all')
  })

  it('allows only the shortcut each tutorial step teaches', async () => {
    useAppStore.setState({ onboardingStep: 4 })
    render(<Onboarding />)
    await waitFor(() => expect(lastGate()).toEqual(['dictation']))

    goToStep(5)
    expect(lastGate()).toEqual(['translate', 'switchLanguage'])

    goToStep(6)
    expect(lastGate()).toEqual(['ask'])

    // Back to a setup step closes the gate again.
    goToStep(3)
    expect(lastGate()).toEqual([])
  })

  it('opens every shortcut when onboarding finishes on the Ask step', async () => {
    useAppStore.setState({ onboardingStep: 6 })
    render(<Onboarding />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete ask' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(lastGate()).toBe('all')
    // The finished flag is saved before the gate opens, so a restart starts open too.
    const saved = vi.mocked(tauri.saveOnboardingCompleted).mock.invocationCallOrder[0]
    const order = vi.mocked(tauri.setShortcutGate).mock.invocationCallOrder
    const opened = order[order.length - 1]
    expect(saved).toBeLessThan(opened)
  })

  it('opens every shortcut when the AI step is skipped and onboarding ends early', async () => {
    useAppStore.setState({ onboardingStep: 3 })
    render(<Onboarding />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip AI' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    expect(lastGate()).toBe('all')
  })

  it('keeps the gate closed when saving on Finish fails', async () => {
    vi.mocked(tauri.updateConfig).mockRejectedValue('disk full')
    useAppStore.setState({ onboardingStep: 6 })
    render(<Onboarding />)
    fireEvent.click(screen.getByRole('button', { name: 'Complete ask' }))
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(await screen.findByText('Could not save: disk full')).toBeInTheDocument()
    expect(tauri.setShortcutGate).not.toHaveBeenCalledWith('all')
  })

  it('closes the gate again when the tour is re-run, and opens it when the tour closes', async () => {
    // After a finished onboarding everything was allowed; the tour re-enters onboarding.
    useAppStore.getState().startShortcutTour()
    render(<Onboarding />)
    await waitFor(() => expect(lastGate()).toEqual(['dictation']))
    expect(tauri.setShortcutGate).not.toHaveBeenCalledWith('all')

    fireEvent.click(screen.getByRole('button', { name: 'Close tour' }))
    expect(lastGate()).toBe('all')
  })

  it('still finishes when the gate call fails', async () => {
    vi.mocked(tauri.setShortcutGate).mockRejectedValue('no backend')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    useAppStore.setState({ onboardingStep: 3 })
    render(<Onboarding />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip AI' }))

    await waitFor(() => expect(useAppStore.getState().onboardingCompleted).toBe(true))
    consoleError.mockRestore()
  })
})
