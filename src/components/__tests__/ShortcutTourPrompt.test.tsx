import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortcutTourPrompt } from '../ShortcutTourPrompt'
import * as tauri from '../../lib/tauri'
import { useAppStore } from '../../stores/appStore'

vi.mock('../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const QUESTION = 'Speech and AI are ready. Try the three shortcuts now?'

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

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useAppStore.setState({ onboardingCompleted: true })
  vi.clearAllMocks()
  vi.mocked(tauri.setShortcutTourState).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('ShortcutTourPrompt', () => {
  it('appears once both services become ready', () => {
    setReady(true, false)
    render(<ShortcutTourPrompt />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    act(() => setReady(true, true))
    expect(screen.getByRole('dialog', { name: QUESTION })).toBeInTheDocument()
  })

  it('"Later" hides it for good and saves that', () => {
    setReady(true, true)
    render(<ShortcutTourPrompt />)

    fireEvent.click(screen.getByRole('button', { name: 'Later' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(tauri.setShortcutTourState).toHaveBeenCalledWith({ promptDismissed: true })
    expect(useAppStore.getState().config.shortcut_tour_prompt_dismissed).toBe(true)
    expect(useAppStore.getState().onboardingCompleted).toBe(true)
  })

  it('"Start" opens onboarding at the Dictate step', () => {
    setReady(true, true)
    render(<ShortcutTourPrompt />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    const state = useAppStore.getState()
    expect(state.onboardingCompleted).toBe(false)
    expect(state.onboardingTour).toBe(true)
    expect(state.onboardingStep).toBe(4)
    expect(state.config.shortcut_tour_prompt_dismissed).toBe(true)
  })

  it('stays hidden once the tour is done or the prompt was answered', () => {
    setReady(true, true)
    useAppStore.getState().applyPersistedConfigPatch({ shortcut_tour_completed: true })
    const { unmount } = render(<ShortcutTourPrompt />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()

    useAppStore.getState().applyPersistedConfigPatch({
      shortcut_tour_completed: false,
      shortcut_tour_prompt_dismissed: true,
    })
    render(<ShortcutTourPrompt />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
