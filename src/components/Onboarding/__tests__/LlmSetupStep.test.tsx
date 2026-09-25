import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { LlmSetupStep } from '../LlmSetupStep'
import * as tauri from '../../../lib/tauri'
import { useAppStore } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

function config() {
  return useAppStore.getState().config
}

function activePreset() {
  return config().ai_presets.find((preset) => preset.id === config().active_ai_preset_id)
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
  vi.mocked(tauri.fetchAiModels).mockResolvedValue([])
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('LlmSetupStep', () => {
  it('shows the same editable preset fields as Settings, starting on local Ollama', () => {
    render(<LlmSetupStep onSkip={vi.fn()} />)

    expect(screen.getByLabelText('Preset')).toHaveValue('builtin-ai-ollama-local')
    expect(screen.getByLabelText('Base URL')).toHaveValue('http://127.0.0.1:11434/v1')
    expect(screen.getByLabelText('Model')).toHaveValue('qwen3:4b-instruct-2507-q4_K_M')
    expect(screen.getByLabelText('Extra request fields (JSON object)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save as new preset/ })).toBeInTheDocument()
  })

  it('a passing test makes AI ready', async () => {
    vi.mocked(tauri.testAiPreset).mockResolvedValue(150)
    render(<LlmSetupStep onSkip={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText(/150 ms/)).toBeInTheDocument()
    expect(activePreset()?.verified_at).toEqual(expect.any(Number))
  })

  it('a placeholder URL fails the test with a clear message', async () => {
    render(<LlmSetupStep onSkip={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Preset'), {
      target: { value: 'builtin-ai-ollama-lan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))

    expect(await screen.findByText(/Replace <computer-ip> in the base URL/)).toBeInTheDocument()
    expect(tauri.testAiPreset).not.toHaveBeenCalled()
    expect(tauri.fetchAiModels).not.toHaveBeenCalled()
  })

  it('"Skip for now" leaves the step', () => {
    const onSkip = vi.fn()
    render(<LlmSetupStep onSkip={onSkip} />)

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('the guide lists the Ollama commands and links to the AI guide', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<LlmSetupStep onSkip={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /How to set this up/ }))

    const guide = screen.getByTestId('setup-guide-ai')
    expect(within(guide).getByText('brew install ollama')).toBeInTheDocument()
    expect(within(guide).getByText('ollama pull qwen3:4b-instruct-2507-q4_K_M')).toBeInTheDocument()
    expect(within(guide).getByText('ollama serve')).toBeInTheDocument()

    fireEvent.click(within(guide).getAllByRole('button', { name: 'Copy command' })[1])
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('ollama pull qwen3:4b-instruct-2507-q4_K_M'),
    )

    fireEvent.click(within(guide).getByRole('button', { name: /Open full guide/ }))
    expect(openUrl).toHaveBeenCalledWith(
      'https://github.com/sennett-lau/typelite/blob/main/docs/guides/ai-polish.md',
    )
  })
})
