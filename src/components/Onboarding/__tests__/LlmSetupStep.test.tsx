import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmSetupStep } from '../LlmSetupStep'
import * as tauri from '../../../lib/tauri'
import { useAppStore, type AiPreset } from '../../../stores/appStore'

vi.mock('../../../lib/tauri')

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const macPreset: AiPreset = {
  id: 'mac-ollama',
  name: 'Mac Ollama',
  base_url: 'http://127.0.0.1:11434/v1',
  model: 'qwen3:1.7b',
  extra_request_fields: {},
  builtin: false,
}

function config() {
  return useAppStore.getState().config
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('LlmSetupStep', () => {
  it('preselects the built-in PC Ollama preset and shows its endpoint and model', () => {
    render(<LlmSetupStep />)

    expect(screen.getByLabelText('AI Polish Service')).toHaveValue('builtin-ollama-pc')
    expect(screen.getByText('http://100.90.208.26:11434/v1')).toBeInTheDocument()
    expect(screen.getByText('qwen3:4b-instruct-2507-q4_K_M')).toBeInTheDocument()
  })

  it('can be tested without an API key and reports the latency', async () => {
    vi.mocked(tauri.testAiPreset).mockResolvedValue(180)
    render(<LlmSetupStep />)

    const testButton = screen.getByRole('button', { name: 'Test Connection' })
    expect(testButton).not.toBeDisabled()
    fireEvent.click(testButton)

    expect(await screen.findByText(/180 ms/)).toBeInTheDocument()
    expect(tauri.testAiPreset).toHaveBeenCalledWith(config().ai_presets[0], '')
    expect(useAppStore.getState().llmTestStatus).toBe('success')
  })

  it('keeps the step blocked when the test fails', async () => {
    vi.mocked(tauri.testAiPreset).mockRejectedValue('timed out')
    render(<LlmSetupStep />)

    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))

    expect(await screen.findByText('Connection failed: timed out')).toBeInTheDocument()
    expect(useAppStore.getState().llmTestStatus).toBe('error')
  })

  it('switching presets activates it and requires a new test', async () => {
    useAppStore.getState().updateConfig({ ai_presets: [...config().ai_presets, macPreset] })
    useAppStore.getState().setLlmTestStatus('success')
    render(<LlmSetupStep />)

    fireEvent.change(screen.getByLabelText('AI Polish Service'), {
      target: { value: 'mac-ollama' },
    })

    expect(config().active_ai_preset_id).toBe('mac-ollama')
    expect(useAppStore.getState().llmTestStatus).toBe('idle')
    await waitFor(() => expect(tauri.readCredential).toHaveBeenCalledWith('llm', 'mac-ollama'))
  })
})
