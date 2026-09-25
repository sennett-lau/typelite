import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { LlmSetupStep } from '../LlmSetupStep'
import * as tauri from '../../../lib/tauri'
import { BUILTIN_AI_PRESETS, useAppStore, type AiPreset } from '../../../stores/appStore'
import { IDLE_SETUP_STATUS } from '../../../stores/modelSetupStore'
import { useAiSetupStore } from '../../../stores/aiSetupStore'
import {
  aiServerPreset,
  hardwareCheck,
  installedAiBuiltin,
} from '../../../test-utils/speechHardware'

vi.mock('../../../lib/tauri')
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const GUIDE = 'https://github.com/sennett-lau/typelite/blob/main/docs/guides/ai-polish.md'
const GB = 1024 ** 3

function config() {
  return useAppStore.getState().config
}

function activePreset() {
  return config().ai_presets.find((preset) => preset.id === config().active_ai_preset_id)
}

function setPresets(ai_presets: AiPreset[], active = 'builtin-ai-this-mac') {
  const next = { ...config(), ai_presets, active_ai_preset_id: active }
  useAppStore.getState().setConfig(next)
  useAppStore.getState().setSavedConfig(next)
}

function setStatus(status: Partial<tauri.SpeechSetupStatus>) {
  act(() => {
    useAiSetupStore.getState().applyStatus({ ...IDLE_SETUP_STATUS, ...status })
  })
}

function card() {
  return screen.getByTestId('builtin-setup-card')
}

function cardButtons() {
  return within(card())
    .queryAllByRole('button')
    .filter((button) => button.getAttribute('role') !== 'radio')
    .map((button) => button.textContent)
}

async function renderStep(onSkip = vi.fn()) {
  render(<LlmSetupStep onSkip={onSkip} />)
  await waitFor(() => expect(useAiSetupStore.getState().hardware).not.toBeNull())
  return onSkip
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  useAiSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null, hardware: null })
  setPresets(BUILTIN_AI_PRESETS.map((preset) => ({ ...preset })))
  vi.clearAllMocks()
  vi.mocked(tauri.readCredential).mockResolvedValue(null)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.getAiSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
  vi.mocked(tauri.listAiModels).mockResolvedValue([])
  vi.mocked(tauri.getAiHardware).mockResolvedValue(
    hardwareCheck(['qwen3-4b', 'qwen3-1.7b'], { serverAvailable: true }),
  )
  vi.mocked(tauri.startAiSetup).mockResolvedValue(undefined)
  vi.mocked(tauri.cancelAiSetup).mockResolvedValue(true)
  vi.mocked(openUrl).mockResolvedValue(undefined)
})

afterEach(() => cleanup())

describe('LlmSetupStep', () => {
  describe('Built-in card', () => {
    it('not set up: the two Qwen models, the hardware note and Set up', async () => {
      await renderStep()

      expect(
        within(card()).getByText(
          'Runs a small open model inside Typelite on this Mac. No other software needed.',
        ),
      ).toBeInTheDocument()
      const models = within(card()).getByRole('radiogroup', { name: 'Model' })
      const best = within(models).getByRole('radio', { name: /Best quality/ })
      expect(best).toHaveAttribute('aria-checked', 'true')
      expect(best).toHaveTextContent('Qwen3 4B Instruct · 2.5 GB')
      expect(within(models).getByRole('radio', { name: /Faster/ })).toHaveTextContent(
        'Qwen3 1.7B · 1.1 GB',
      )
      expect(within(card()).getByText('This Mac: Apple M1 Pro, 32 GB memory.')).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Set up'])

      fireEvent.click(within(models).getByRole('radio', { name: /Faster/ }))
      fireEvent.click(within(card()).getByRole('button', { name: 'Set up' }))
      expect(tauri.startAiSetup).toHaveBeenCalledWith('qwen3-1.7b')
      expect(tauri.startSpeechSetup).not.toHaveBeenCalled()
    })

    it('an 8 GB Mac gets only the faster model and says why', async () => {
      vi.mocked(tauri.getAiHardware).mockResolvedValue(
        hardwareCheck(['qwen3-1.7b'], {
          memoryBytes: 8 * GB,
          leftOut: 'needs_memory',
          serverAvailable: true,
        }),
      )
      await renderStep()

      expect(within(card()).getByRole('radio', { name: /Faster/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      expect(
        within(card()).getByText(
          'This Mac: Apple M1 Pro, 8 GB memory. The larger model needs 16 GB of memory.',
        ),
      ).toBeInTheDocument()
    })

    it('a Mac no model suits shows only the note: no cards, no status, no button', async () => {
      vi.mocked(tauri.getAiHardware).mockResolvedValue(
        hardwareCheck([], {
          chipKind: 'intel',
          chipName: 'Intel Core i7',
          leftOut: 'needs_apple_silicon',
          serverAvailable: true,
        }),
      )
      await renderStep()

      expect(
        within(card()).getByText(
          'This Mac can’t run a built-in AI model well. Use your own server or API key instead.',
        ),
      ).toBeInTheDocument()
      expect(within(card()).queryByRole('radiogroup')).not.toBeInTheDocument()
      expect(within(card()).queryByText('Recommended')).not.toBeInTheDocument()
      expect(cardButtons()).toEqual([])
      // The server option is still there.
      expect(
        screen.getByRole('button', { name: 'Use your own server or API key…' }),
      ).toBeInTheDocument()
    })

    it('a build without llama-server says so and offers no setup', async () => {
      vi.mocked(tauri.getAiHardware).mockResolvedValue(
        hardwareCheck(['qwen3-4b', 'qwen3-1.7b'], { serverAvailable: false }),
      )
      await renderStep()

      expect(
        within(card()).getByText(
          'This copy of Typelite was built without the built-in AI server. Use your own server or API key instead.',
        ),
      ).toBeInTheDocument()
      expect(cardButtons()).toEqual([])
    })

    it('downloading: sizes in GB, bar, speed and Cancel', async () => {
      await renderStep()
      setStatus({
        modelId: 'qwen3-4b',
        phase: 'downloading',
        downloadedBytes: 1_000_000_000,
        totalBytes: 2_497_281_120,
        bytesPerSecond: 15_000_000,
      })

      expect(within(card()).getByText('Downloading 40%')).toHaveClass('badge', 'badge-neutral')
      expect(within(card()).getByText('Best quality · 1.0 of 2.5 GB')).toBeInTheDocument()
      expect(
        within(card()).getByRole('progressbar', { name: 'AI model download' }),
      ).toHaveAttribute('aria-valuenow', '40')
      expect(cardButtons()).toEqual(['Cancel'])
      fireEvent.click(within(card()).getByRole('button', { name: 'Cancel' }))
      expect(tauri.cancelAiSetup).toHaveBeenCalledTimes(1)

      setStatus({ modelId: 'qwen3-4b', phase: 'testing', downloadedBytes: 1, totalBytes: 1 })
      expect(within(card()).getByText('Starting the model and running a test…')).toBeInTheDocument()
    })

    it('ready: the model, its size and the test time, and Change model', async () => {
      await renderStep()
      act(() => {
        useAppStore
          .getState()
          .applyPersistedConfigPatch({ ai_presets: [installedAiBuiltin('qwen3-4b', 42)] })
      })
      setStatus({ modelId: 'qwen3-4b', phase: 'ready', testMs: 600 })

      expect(within(card()).getByText('Ready')).toHaveClass('badge')
      expect(within(card()).getByText('Best quality')).toBeInTheDocument()
      expect(
        within(card()).getByText('Qwen3 4B Instruct · 2.5 GB · tested on this Mac in 600 ms'),
      ).toBeInTheDocument()
      expect(cardButtons()).toEqual(['Change model'])
    })

    it('failed: "Download failed", the reason and Try again', async () => {
      await renderStep()
      setStatus({
        modelId: 'qwen3-1.7b',
        phase: 'error',
        error: { code: 'network', reason: 'connection reset' },
      })

      expect(within(card()).getByText('Download failed')).toHaveClass('badge-error')
      expect(within(card()).getByText('Nothing was installed')).toBeInTheDocument()
      fireEvent.click(within(card()).getByRole('button', { name: 'Try again' }))
      expect(tauri.startAiSetup).toHaveBeenCalledWith('qwen3-1.7b')
    })

    it('a model that did not answer shows "Test failed" with the reason', async () => {
      await renderStep()
      setStatus({
        modelId: 'qwen3-4b',
        phase: 'error',
        error: {
          code: 'load',
          reason: 'The built-in AI server stopped while loading the model: exit status: 1',
        },
      })

      expect(within(card()).getByText('Test failed')).toBeInTheDocument()
      expect(within(card()).queryByText('Nothing was installed')).not.toBeInTheDocument()
      expect(
        within(card()).getByText(
          'The built-in AI server stopped while loading the model: exit status: 1',
        ),
      ).toBeInTheDocument()
    })
  })

  describe('Your own server or API key (sheet)', () => {
    it('opens on the AI form: OpenAI placeholders, Learn more to the AI guide, Advanced', async () => {
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))

      const sheet = screen.getByRole('dialog', { name: 'Add your server or API key' })
      expect(within(sheet).getByLabelText('Address')).toHaveAttribute(
        'placeholder',
        'https://api.openai.com/v1',
      )
      expect(within(sheet).getByLabelText('Model')).toHaveAttribute('placeholder', 'gpt-4.1-mini')
      expect(within(sheet).queryByLabelText('Extra fields')).not.toBeInTheDocument()
      fireEvent.click(within(sheet).getByRole('button', { name: 'Advanced' }))
      expect(within(sheet).getByLabelText('Extra fields')).toHaveAttribute(
        'placeholder',
        '{"reasoning_effort": "none"}',
      )

      fireEvent.click(within(sheet).getByRole('button', { name: 'Learn more' }))
      expect(openUrl).toHaveBeenCalledWith(GUIDE)
    })

    it('tests and saves an AI preset with extra fields, ready and in use', async () => {
      vi.mocked(tauri.testAiPreset).mockResolvedValue(200)
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))
      const sheet = screen.getByRole('dialog')

      fireEvent.change(within(sheet).getByLabelText('Address'), {
        target: { value: 'http://192.0.2.10:11434/v1' },
      })
      fireEvent.change(within(sheet).getByLabelText('Model'), {
        target: { value: 'qwen3:4b-instruct-2507-q4_K_M' },
      })
      fireEvent.click(within(sheet).getByRole('button', { name: 'Advanced' }))
      const extra = within(sheet).getByLabelText('Extra fields')
      fireEvent.change(extra, { target: { value: '[1]' } })
      expect(within(sheet).getByRole('button', { name: 'Save and use' })).toBeDisabled()
      fireEvent.change(extra, { target: { value: '{"reasoning_effort": "none"}' } })

      fireEvent.click(within(sheet).getByRole('button', { name: 'Test' }))
      expect(await within(sheet).findByText('Works · 200 ms')).toBeInTheDocument()
      expect(tauri.testAiPreset).toHaveBeenCalledWith(
        expect.objectContaining({ extra_request_fields: { reasoning_effort: 'none' } }),
        '',
      )

      fireEvent.click(within(sheet).getByRole('button', { name: 'Save and use' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(activePreset()).toMatchObject({
        name: '192.0.2.10',
        kind: 'openai_compatible',
        base_url: 'http://192.0.2.10:11434/v1',
        extra_request_fields: { reasoning_effort: 'none' },
        builtin: false,
      })
      expect(activePreset()?.verified_at).toEqual(expect.any(Number))
      expect(tauri.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ active_ai_preset_id: activePreset()!.id }),
      )
      expect(screen.getByTestId('ai-using-server')).toHaveTextContent('Using “192.0.2.10”.')
    })

    it('lists saved presets and "Test and use" makes one the preset in use', async () => {
      const pc = aiServerPreset('pc', 'Ollama on my PC', 'http://192.0.2.10:11434/v1')
      setPresets([installedAiBuiltin('qwen3-4b', null), pc])
      vi.mocked(tauri.testAiPreset).mockResolvedValue(150)
      await renderStep()
      fireEvent.click(screen.getByRole('button', { name: 'Use your own server or API key…' }))

      const sheet = screen.getByRole('dialog', { name: 'Your own server or API key' })
      expect(within(sheet).getByRole('button', { name: /Ollama on my PC/ })).toHaveTextContent(
        '192.0.2.10:11434',
      )
      fireEvent.click(within(sheet).getByRole('button', { name: 'Test and use' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(tauri.testAiPreset).toHaveBeenCalledWith(pc, '')
      expect(config().active_ai_preset_id).toBe('pc')
      expect(activePreset()?.verified_at).toEqual(expect.any(Number))
    })
  })

  it('"Skip for now" leaves the step and says dictation still works', async () => {
    const onSkip = await renderStep()
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    expect(skip).toHaveAttribute('title', 'Dictation still works; you get the raw transcript')
    fireEvent.click(skip)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})
