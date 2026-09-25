import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { LlmPane } from '../LlmPane'
import * as tauri from '../../../lib/tauri'
import type { AiPreset } from '../../../stores/appStore'

// Mock Tauri
vi.mock('../../../lib/tauri')

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'settings.model': 'Model',
        'settings.baseUrl': 'Base URL',
        'settings.test': 'Test',
        'settings.connectionSuccess': 'Connection successful',
        'settings.connectionFailed': 'Connection failed',
        'settings.storedLocally': 'Stored locally',
        'settings.fetchModels': 'Fetch models',
        'settings.modelsAvailable': `${params?.count || 0} models available`,
        'settings.enableAiPolish': 'AI cleanup for dictation',
        'settings.enableAiPolishDesc': 'Cleans up dictation before output',
        'settings.contextAdaptation': 'Adapt writing to the current app',
        'settings.contextAdaptationHint': 'Uses a private local app category',
        'settings.contextAdaptationApps': 'Apps adapted by context',
        'settings.lastDictationContext': 'Last dictation context',
        'settings.browserAccessHint':
          'Allow browser access to use Gmail, Docs, and Slack Web modes.',
        'settings.appStyleMenu': 'App writing style',
        'settings.useDifferentWritingStyle': 'Use a different writing style',
        'settings.manageAppMappings': 'Manage app mappings',
        'settings.appStyleDialogTitle': 'Writing style for this app',
        'settings.polishStyle': 'Polish style',
        'settings.polishStyleMinimal': 'Minimal',
        'settings.polishStyleClean': 'Clean',
        'settings.polishStyleStructured': 'Structured',
        'settings.polishStyleProfessional': 'Professional',
        'settings.advancedPolishSettings': 'Advanced polish settings',
        'settings.advancedPolishSettingsDesc': 'Optional writing rules',
        'settings.customPolishInstructions': 'Custom polish instructions',
        'settings.customPolishInstructionsPlaceholder': 'Example prompt',
        'settings.customPolishInstructionsCount': `${params?.count || 0} / 2000 characters`,
        'settings.activeScene': `Active scene: ${params?.name || ''}`,
        'settings.clearActiveScene': 'Clear scene',
        'settings.translationMode': 'Always translate output',
        'settings.translationModeDesc': 'Translate each dictation result',
        'settings.selectedTextContext': 'Use selected text as context',
        'settings.selectedTextContextDesc': 'Use selected text for context',
        'settings.targetLanguage': 'Translate to',
        'settings.manageTranslationTargets': 'Manage languages',
        'settings.askAnything': 'Ask Anything',
        'settings.askAnythingDesc': 'Voice question, one-shot answer. No chat history.',
        'ask.ready': 'Ready to ask',
        'ask.listening': 'Listening',
        'ask.thinking': 'Thinking',
        'ask.voiceQuestion': 'Voice question',
        'ask.voiceQuestionDesc': 'Speak your question. Stop recording to answer.',
        'ask.transcriptLabel': 'Question transcript',
        'ask.answerLabel': 'Answer',
        'ask.manualFallback': 'Type instead',
        'ask.placeholder': 'Type a question, or use the capsule above.',
        'ask.recordQuestion': 'Record question',
        'ask.stopAndAsk': 'Stop and ask',
        'ask.send': 'Ask',
        'presets.preset': 'Preset',
        'presets.name': 'Preset name',
        'presets.saveAsNew': 'Save as new preset',
        'presets.delete': 'Delete',
        'presets.copyName': `${params?.name} copy`,
        'presets.builtinHint': 'Built-in preset.',
        'presets.apiKeyOptional': 'API key (optional)',
        'presets.apiKeyPlaceholder': 'Leave empty for local servers',
        'presets.extraFields': 'Extra request fields (JSON object)',
        'presets.extraFieldsHint': 'Added to every chat request.',
        'presets.extraFieldsInvalid': 'This is not a JSON object, so it is not saved.',
        'presets.latency': `${params?.ms} ms`,
      }
      return translations[key] || key
    },
  }),
}))

const builtinAiPreset: AiPreset = {
  id: 'builtin-ollama-pc',
  name: 'PC Ollama — Qwen3 4B Instruct',
  base_url: 'http://192.0.2.10:11434/v1',
  model: 'qwen3:4b-instruct-2507-q4_K_M',
  extra_request_fields: {},
  builtin: true,
  verified_at: null,
}

const thinkingPreset: AiPreset = {
  id: 'pc-qwen35',
  name: 'PC Ollama — Qwen3.5',
  base_url: 'http://192.0.2.10:11434/v1',
  model: 'qwen3.5:4b',
  extra_request_fields: { reasoning_effort: 'none' },
  builtin: false,
  verified_at: null,
}

function baseConfig() {
  return {
    ai_presets: [builtinAiPreset] as AiPreset[],
    active_ai_preset_id: 'builtin-ollama-pc',
    polish_enabled: true,
    context_adaptation_enabled: true,
    polish_style: 'clean',
    polish_custom_prompt: '',
    polish_chinese_script: 'preserve',
    custom_scenes: [],
    active_scene: null as any,
    family_scene_assignments: [],
    translate_enabled: false,
    selected_text_enabled: false,
    target_lang: 'en',
    translation: { targets: ['en', 'zh', 'ja'], active_target: 'en' },
  }
}

// Mock stores - must be done before importing the component
const mockAppStore = {
  config: baseConfig(),
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  setSavedConfig: vi.fn(),
  llmTestStatus: 'idle' as 'idle' | 'testing' | 'success' | 'error',
  setLlmTestStatus: vi.fn(),
  llmLatencyMs: null as number | null,
  setLlmLatencyMs: vi.fn(),
  llmModels: [] as string[],
  setLlmModels: vi.fn(),
  setAiHealth: vi.fn(),
  lastContext: null as any,
}

vi.mock('../../../stores/appStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../stores/appStore')>()
  return {
    ...actual,
    useAppStore: Object.assign(
      (selector: any) => {
        if (typeof selector === 'function') {
          return selector(mockAppStore)
        }
        return mockAppStore
      },
      { getState: () => mockAppStore, setState: vi.fn() },
    ),
  }
})

/** The ai_presets list from the last updateConfig call. */
function lastPresetUpdate(): AiPreset[] {
  const calls = mockAppStore.updateConfig.mock.calls
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0].ai_presets) return calls[i][0].ai_presets
  }
  throw new Error('updateConfig was not called with ai_presets')
}

describe('LlmPane', () => {
  beforeEach(() => {
    mockAppStore.config = baseConfig()
    mockAppStore.llmTestStatus = 'idle'
    mockAppStore.llmLatencyMs = null
    mockAppStore.llmModels = []
    mockAppStore.lastContext = null

    vi.clearAllMocks()
    vi.mocked(tauri.readCredential).mockResolvedValue(null)
    vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
    vi.mocked(tauri.fetchAiModels).mockResolvedValue([])
    vi.mocked(tauri.getLatestMappingCandidate).mockResolvedValue(null)
    vi.mocked(tauri.listCustomAppMappings).mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('Preset picker', () => {
    it('shows the built-in PC Ollama preset', () => {
      render(<LlmPane />)

      expect(screen.getByLabelText('Preset')).toHaveValue('builtin-ollama-pc')
      expect(screen.getByLabelText('Base URL')).toHaveValue('http://192.0.2.10:11434/v1')
      expect(screen.getByLabelText('Model')).toHaveValue('qwen3:4b-instruct-2507-q4_K_M')
      expect(screen.getByLabelText('Extra request fields (JSON object)')).toHaveValue('')
    })

    it('switches the active preset and clears the cached model list', () => {
      mockAppStore.config.ai_presets = [builtinAiPreset, thinkingPreset]
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Preset'), { target: { value: 'pc-qwen35' } })

      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        ai_presets: [builtinAiPreset, thinkingPreset],
        active_ai_preset_id: 'pc-qwen35',
      })
      expect(mockAppStore.setLlmTestStatus).toHaveBeenCalledWith('idle')
      expect(mockAppStore.setLlmModels).toHaveBeenCalledWith([])
    })

    it('shows the extra fields of the active preset as JSON', () => {
      mockAppStore.config.ai_presets = [builtinAiPreset, thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
      render(<LlmPane />)

      const extras = screen.getByLabelText(
        'Extra request fields (JSON object)',
      ) as HTMLTextAreaElement
      expect(JSON.parse(extras.value)).toEqual({ reasoning_effort: 'none' })
      expect(tauri.readCredential).toHaveBeenCalledWith('llm', 'pc-qwen35')
    })

    it('saves a copy, including its extra fields, as the new active preset', () => {
      mockAppStore.config.ai_presets = [thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
      render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: /Save as new preset/ }))

      const update = mockAppStore.updateConfig.mock.calls[0][0]
      expect(update.ai_presets).toHaveLength(2)
      const created = update.ai_presets[1]
      expect(created).toMatchObject({
        name: 'PC Ollama — Qwen3.5 copy',
        model: 'qwen3.5:4b',
        extra_request_fields: { reasoning_effort: 'none' },
        builtin: false,
      })
      expect(created.id).not.toBe('pc-qwen35')
      expect(update.active_ai_preset_id).toBe(created.id)
    })

    it('deletes the active preset and activates the first remaining one', () => {
      mockAppStore.config.ai_presets = [builtinAiPreset, thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
      render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        ai_presets: [builtinAiPreset],
        active_ai_preset_id: 'builtin-ollama-pc',
      })
    })

    it('keeps Delete disabled for the last preset', () => {
      render(<LlmPane />)
      expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
    })
  })

  describe('Preset fields', () => {
    it('updates the model of the active preset and resets latency', () => {
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'qwen3:8b' } })

      expect(lastPresetUpdate()).toEqual([{ ...builtinAiPreset, model: 'qwen3:8b' }])
      expect(mockAppStore.setLlmLatencyMs).toHaveBeenCalledWith(null)
    })

    it('updates the base URL and clears the cached model list', () => {
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Base URL'), {
        target: { value: 'http://127.0.0.1:11434/v1' },
      })

      expect(lastPresetUpdate()).toEqual([
        { ...builtinAiPreset, base_url: 'http://127.0.0.1:11434/v1' },
      ])
      expect(mockAppStore.setLlmModels).toHaveBeenCalledWith([])
    })

    it('displays available models count', () => {
      mockAppStore.llmModels = ['qwen3:4b', 'qwen3:8b', 'llama3.2']

      render(<LlmPane />)
      expect(screen.getByText('3 models available')).toBeInTheDocument()
    })

    it('auto-fetches models from the preset base URL without an API key', async () => {
      vi.mocked(tauri.fetchAiModels).mockResolvedValue(['qwen3:4b'])
      render(<LlmPane />)

      await waitFor(
        () => {
          expect(tauri.fetchAiModels).toHaveBeenCalledWith('http://192.0.2.10:11434/v1', '')
        },
        { timeout: 1500 },
      )
      await waitFor(() => {
        expect(mockAppStore.setLlmModels).toHaveBeenCalledWith(['qwen3:4b'])
      })
    })

    it('does not auto-fetch when models are already cached', async () => {
      mockAppStore.llmModels = ['cached']
      render(<LlmPane />)

      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(tauri.fetchAiModels).not.toHaveBeenCalled()
    })
  })

  describe('Extra request fields', () => {
    it('writes a valid JSON object into the active preset', () => {
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Extra request fields (JSON object)'), {
        target: { value: '{"reasoning_effort": "none", "temperature": 0.2}' },
      })

      expect(lastPresetUpdate()[0].extra_request_fields).toEqual({
        reasoning_effort: 'none',
        temperature: 0.2,
      })
      expect(
        screen.queryByText('This is not a JSON object, so it is not saved.'),
      ).not.toBeInTheDocument()
    })

    it.each([
      ['broken JSON', '{"reasoning_effort": '],
      ['an array', '["reasoning_effort"]'],
      ['a string', '"none"'],
      ['null', 'null'],
    ])('rejects %s without writing it into the config', (_label, text) => {
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Extra request fields (JSON object)'), {
        target: { value: text },
      })

      expect(screen.getByText('This is not a JSON object, so it is not saved.')).toBeInTheDocument()
      expect(mockAppStore.updateConfig).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
    })

    it('treats an empty box as no extra fields', () => {
      mockAppStore.config.ai_presets = [thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('Extra request fields (JSON object)'), {
        target: { value: '   ' },
      })

      expect(lastPresetUpdate()[0].extra_request_fields).toEqual({})
    })

    it('shows the example as placeholder', () => {
      render(<LlmPane />)
      expect(screen.getByPlaceholderText('{"reasoning_effort": "none"}')).toBeInTheDocument()
    })
  })

  describe('API key', () => {
    it('loads the key for the active preset from the Keychain', async () => {
      vi.mocked(tauri.readCredential).mockResolvedValue('sk-stored')
      render(<LlmPane />)

      await waitFor(() => {
        expect(screen.getByLabelText('API key (optional)')).toHaveValue('sk-stored')
      })
      expect(tauri.readCredential).toHaveBeenCalledWith('llm', 'builtin-ollama-pc')
      expect((screen.getByLabelText('API key (optional)') as HTMLInputElement).type).toBe(
        'password',
      )
    })

    it('stores the key under the preset id and resets the test state', async () => {
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('API key (optional)'), {
        target: { value: 'sk-new-key' },
      })

      await waitFor(() => {
        expect(tauri.setCredential).toHaveBeenCalledWith('llm', 'builtin-ollama-pc', 'sk-new-key')
      })
      expect(mockAppStore.updateConfig).not.toHaveBeenCalled()
      expect(mockAppStore.setLlmTestStatus).toHaveBeenCalledWith('idle')
    })

    it('shows an inline error when the Keychain save fails', async () => {
      vi.mocked(tauri.setCredential).mockRejectedValueOnce(new Error('vault locked'))
      render(<LlmPane />)

      fireEvent.change(screen.getByLabelText('API key (optional)'), {
        target: { value: 'sk-new-key' },
      })

      expect(await screen.findByText('settings.credentialSaveFailed')).toBeInTheDocument()
    })
  })

  describe('Test button and latency display', () => {
    it('is enabled without an API key', () => {
      render(<LlmPane />)
      expect(screen.getByRole('button', { name: 'Test' })).not.toBeDisabled()
    })

    it('tests the active preset, extras included, and reports the latency', async () => {
      mockAppStore.config.ai_presets = [thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
      vi.mocked(tauri.testAiPreset).mockResolvedValue(142)
      render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))

      await waitFor(() => {
        expect(tauri.testAiPreset).toHaveBeenCalledWith(thinkingPreset, '')
        expect(mockAppStore.setLlmLatencyMs).toHaveBeenCalledWith(142)
        expect(mockAppStore.setLlmTestStatus).toHaveBeenCalledWith('success')
      })
    })

    it('shows loading state during test', () => {
      mockAppStore.llmTestStatus = 'testing'
      render(<LlmPane />)
      expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled()
    })

    it('displays latency in milliseconds when test succeeds', () => {
      mockAppStore.llmTestStatus = 'success'
      mockAppStore.llmLatencyMs = 142
      render(<LlmPane />)
      expect(screen.getByText('142 ms')).toBeInTheDocument()
    })

    it('displays generic success message when latency is null', () => {
      mockAppStore.llmTestStatus = 'success'
      mockAppStore.llmLatencyMs = null
      render(<LlmPane />)
      expect(screen.getByText('Connection successful')).toBeInTheDocument()
    })

    it('shows backend error details when the test fails', async () => {
      vi.mocked(tauri.testAiPreset).mockRejectedValueOnce('HTTP 404: model not found')
      const view = render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      await waitFor(() => {
        expect(mockAppStore.setLlmTestStatus).toHaveBeenCalledWith('error')
      })
      mockAppStore.llmTestStatus = 'error'
      view.rerender(<LlmPane />)

      expect(screen.getByText('HTTP 404: model not found')).toBeInTheDocument()
    })
  })

  describe('Ask Anything', () => {
    it('keeps Ask Anything out of AI Polish settings', () => {
      render(<LlmPane />)

      expect(screen.queryByText('Ask Anything')).not.toBeInTheDocument()
      expect(screen.queryByText('Voice question')).not.toBeInTheDocument()
    })
  })

  describe('AI polish behavior settings', () => {
    it('shows Clean as the default polish style outside advanced settings', () => {
      render(<LlmPane />)

      expect(screen.getByText('Polish style')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Clean')).toBeInTheDocument()
    })

    it('updates the selected polish style without opening advanced settings', () => {
      render(<LlmPane />)

      fireEvent.change(screen.getByDisplayValue('Clean'), { target: { value: 'structured' } })

      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({ polish_style: 'structured' })
      expect(screen.queryByText('Custom polish instructions')).not.toBeInTheDocument()
    })

    it('keeps custom instruction controls inside advanced settings', () => {
      render(<LlmPane />)

      expect(screen.getByText('Advanced polish settings')).toBeInTheDocument()
      expect(screen.queryByText('Optional writing rules')).not.toBeInTheDocument()
      expect(screen.queryByText('Chinese output')).not.toBeInTheDocument()
      expect(screen.queryByText('Custom polish instructions')).not.toBeInTheDocument()
      expect(screen.queryByText('Use selected text as context')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /advanced polish settings/i }))

      expect(screen.getByText('Custom polish instructions')).toBeInTheDocument()
      expect(screen.getByText('Use selected text as context')).toBeInTheDocument()
      expect(screen.getByText('Use selected text for context')).toBeInTheDocument()
      expect(screen.queryByText('Chinese output')).not.toBeInTheDocument()
    })

    it('keeps selected-text controls reachable when cleanup is disabled', () => {
      mockAppStore.config.polish_enabled = false
      render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: /advanced polish settings/i }))

      expect(screen.getByText('Use selected text as context')).toBeInTheDocument()
      expect(screen.queryByText('Custom polish instructions')).not.toBeInTheDocument()
    })

    it('updates custom polish instructions from advanced settings', () => {
      render(<LlmPane />)

      fireEvent.click(screen.getByRole('button', { name: /advanced polish settings/i }))
      const textarea = screen.getByPlaceholderText('Example prompt')
      fireEvent.change(textarea, { target: { value: 'Keep a concise professional tone.' } })

      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        polish_custom_prompt: 'Keep a concise professional tone.',
      })
    })

    it('opens advanced settings automatically when custom instructions exist', () => {
      mockAppStore.config.polish_custom_prompt = 'Keep it concise.'

      render(<LlmPane />)

      expect(screen.getByText('Custom polish instructions')).toBeInTheDocument()
      expect(screen.queryByText('Chinese output')).not.toBeInTheDocument()
    })

    it('does not expose legacy global active scenes in AI Polish', () => {
      mockAppStore.config.active_scene = {
        id: 'custom_meeting',
        source: 'custom',
        name: 'Meeting Notes',
        prompt_template: 'Use bullets.',
      }

      render(<LlmPane />)

      expect(screen.queryByText('Active scene: Meeting Notes')).not.toBeInTheDocument()
      expect(screen.queryByText('Clear scene')).not.toBeInTheDocument()
    })
  })

  describe('Feature toggles', () => {
    it('keeps context adaptation adjacent to AI polish and disables it when polish is off', () => {
      mockAppStore.config.polish_enabled = false
      render(<LlmPane />)

      const contextSwitch = screen.getByRole('switch', {
        name: 'Adapt writing to the current app',
      })
      expect(contextSwitch).toBeDisabled()
    })

    it('updates the context adaptation preference', () => {
      render(<LlmPane />)
      const contextSwitch = screen.getByRole('switch', {
        name: 'Adapt writing to the current app',
      })
      fireEvent.click(contextSwitch)
      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        context_adaptation_enabled: false,
      })
    })

    it('shows a compact noninteractive line of representative adapted apps', () => {
      render(<LlmPane />)

      const coverage = screen.getByLabelText('Apps adapted by context')
      for (const name of [
        'Gmail',
        'Slack',
        'Lark',
        'WeChat',
        'Google Docs',
        'Notion',
        'GitHub',
        'Cursor',
      ]) {
        expect(within(coverage).getByLabelText(name)).toBeInTheDocument()
      }
      expect(within(coverage).getByText('+63')).toBeInTheDocument()
      expect(within(coverage).getByText('+65')).toHaveClass('context-app-count--compact')
      expect(within(coverage).getByLabelText('Lark')).toHaveClass('context-app--compact-duplicate')
      expect(within(coverage).getByLabelText('Notion')).toHaveClass(
        'context-app--compact-duplicate',
      )
      expect(within(coverage).queryByRole('button')).not.toBeInTheDocument()
      expect(within(coverage).queryByRole('link')).not.toBeInTheDocument()
      expect(coverage).toHaveAttribute('aria-disabled', 'false')
      expect(coverage).toHaveClass('gap-1')
    })

    it('dims representative apps whenever app adaptation is not active', () => {
      mockAppStore.config.context_adaptation_enabled = false
      render(<LlmPane />)

      expect(screen.getByLabelText('Apps adapted by context')).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })

    it('keeps helper copy and advanced toggles out of the default flow', () => {
      render(<LlmPane />)

      expect(screen.queryByText('Cleans up dictation before output')).not.toBeInTheDocument()
      expect(screen.queryByText('Translate each dictation result')).not.toBeInTheDocument()
      expect(screen.queryByText('Uses a private local app category')).not.toBeInTheDocument()
      expect(screen.queryByText('Use selected text as context')).not.toBeInTheDocument()
      expect(screen.queryByText('Use selected text for context')).not.toBeInTheDocument()
    })

    it('hides last context until an operation snapshot exists', () => {
      render(<LlmPane />)
      expect(screen.queryByText('Last dictation context')).not.toBeInTheDocument()
    })

    it('shows only the safe last operation context after dictation', () => {
      mockAppStore.lastContext = {
        profileId: 'chat.slack',
        family: 'work_chat',
        appLabel: 'Slack',
        iconKey: 'slack',
        overrideId: 'slack',
        browserAccessStatus: 'available',
      }
      render(<LlmPane />)

      expect(screen.getByText('Last dictation context')).toBeInTheDocument()
      expect(screen.getByText('Slack')).toBeInTheDocument()
      expect(screen.queryByText(/window|host|confidence/i)).not.toBeInTheDocument()
    })

    it('shows a short browser access hint when browser context needs URL access', () => {
      mockAppStore.lastContext = {
        profileId: 'general.browser',
        family: 'general',
        appLabel: 'Browser',
        iconKey: 'general',
        overrideId: null,
        browserAccessStatus: 'needs_permission',
      }

      render(<LlmPane />)

      expect(
        screen.getByText('Allow browser access to use Gmail, Docs, and Slack Web modes.'),
      ).toBeInTheDocument()
    })

    it('keeps the app-style overflow hidden without a live candidate or user mappings', async () => {
      mockAppStore.lastContext = {
        profileId: 'chat.slack',
        family: 'work_chat',
        appLabel: 'Slack',
        iconKey: 'slack',
        overrideId: 'slack',
        browserAccessStatus: 'available',
      }

      render(<LlmPane />)

      await waitFor(() => expect(tauri.listCustomAppMappings).toHaveBeenCalled())
      expect(screen.queryByRole('button', { name: 'App writing style' })).not.toBeInTheDocument()
    })

    it('opens one compact writing-style dialog from a live safe candidate', async () => {
      mockAppStore.lastContext = {
        profileId: 'general.browser',
        family: 'general',
        appLabel: 'Example',
        iconKey: 'general',
        overrideId: null,
        browserAccessStatus: 'available',
      }
      vi.mocked(tauri.getLatestMappingCandidate).mockResolvedValue({
        generation: 7,
        matcherType: 'exact_web_host',
        displayValue: 'docs.example.com',
        suggestedLabel: 'docs.example.com',
        currentFamily: 'document',
        iconKey: 'general',
      })

      render(<LlmPane />)

      fireEvent.click(await screen.findByRole('button', { name: 'App writing style' }))
      fireEvent.click(screen.getByText('Use a different writing style'))

      expect(
        await screen.findByRole('dialog', { name: 'Writing style for this app' }),
      ).toBeVisible()
      expect(screen.getByText('docs.example.com')).toBeInTheDocument()
    })

    it('shows mapping management only for user-created mappings', async () => {
      mockAppStore.lastContext = {
        profileId: 'chat.slack',
        family: 'work_chat',
        appLabel: 'Slack',
        iconKey: 'slack',
        overrideId: 'slack',
        browserAccessStatus: 'available',
      }
      vi.mocked(tauri.listCustomAppMappings).mockResolvedValue([
        {
          id: 'mapping-1',
          label: 'Work Slack',
          matcherType: 'native_bundle_id',
          displayValue: 'Work Slack · macOS',
          family: 'work_chat',
          sceneId: null,
          enabled: true,
          iconKey: 'slack',
        },
      ])

      render(<LlmPane />)

      fireEvent.click(await screen.findByRole('button', { name: 'App writing style' }))
      expect(screen.getByText('Manage app mappings')).toBeInTheDocument()
      expect(screen.queryByText('Use a different writing style')).not.toBeInTheDocument()
      expect(screen.queryByText('Gmail')).not.toBeInTheDocument()
    })

    it('shows the translation language slots next to translation when enabled', () => {
      mockAppStore.config.translate_enabled = true
      mockAppStore.config.translation = { targets: ['en'], active_target: 'en' }

      render(<LlmPane />)
      expect(screen.getByRole('radiogroup', { name: 'translate.targetsLabel' })).toBeInTheDocument()
      // The single stored target is padded to three once.
      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        translation: { targets: ['en', 'zh', 'ja'], active_target: 'en' },
      })
    })

    it('shows the translation languages even when always-translate is off', () => {
      mockAppStore.config.translate_enabled = false

      render(<LlmPane />)
      expect(screen.getByRole('radiogroup', { name: 'translate.targetsLabel' })).toBeInTheDocument()
    })
  })
})
