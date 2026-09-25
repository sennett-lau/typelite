import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { LlmPane } from '../LlmPane'
import * as tauri from '../../../lib/tauri'
import type { AiPreset } from '../../../stores/appStore'
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

const thinkingPreset: AiPreset = {
  ...aiServerPreset('pc-qwen35', 'PC Ollama — Qwen3.5', 'http://192.0.2.10:11434/v1', 'qwen3.5:4b'),
  extra_request_fields: { reasoning_effort: 'none' },
}

function baseConfig() {
  return {
    ai_presets: [installedAiBuiltin('qwen3-4b', null)] as AiPreset[],
    active_ai_preset_id: 'builtin-ai-this-mac',
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
    translation: { targets: ['en', 'zh-Hans', 'ja'], active_target: 'en' },
  }
}

// Mock stores - must be done before importing the component
const mockAppStore = {
  config: baseConfig(),
  savedConfig: null as any,
  updateConfig: vi.fn(),
  setConfig: vi.fn(),
  setSavedConfig: vi.fn(),
  applyPersistedConfigPatch: vi.fn(),
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

function engineCards() {
  return screen.getByRole('radiogroup', { name: 'AI polish uses' })
}

async function renderPane() {
  render(<LlmPane />)
  await waitFor(() => expect(useAiSetupStore.getState().hardware).not.toBeNull())
}

describe('LlmPane', () => {
  beforeEach(() => {
    mockAppStore.config = baseConfig()
    mockAppStore.savedConfig = null
    mockAppStore.lastContext = null
    useAiSetupStore.setState({ status: IDLE_SETUP_STATUS, models: null, hardware: null })

    vi.clearAllMocks()
    vi.mocked(tauri.readCredential).mockResolvedValue(null)
    vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
    vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
    vi.mocked(tauri.getLatestMappingCandidate).mockResolvedValue(null)
    vi.mocked(tauri.listCustomAppMappings).mockResolvedValue([])
    vi.mocked(tauri.getAiSetupStatus).mockResolvedValue(IDLE_SETUP_STATUS)
    vi.mocked(tauri.listAiModels).mockResolvedValue([
      {
        id: 'qwen3-4b',
        fileName: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
        sizeBytes: 2_497_281_120,
        installed: false,
      },
      {
        id: 'qwen3-1.7b',
        fileName: 'Qwen3-1.7B-Q4_K_M.gguf',
        sizeBytes: 1_107_409_472,
        installed: false,
      },
    ])
    vi.mocked(tauri.getAiHardware).mockResolvedValue(
      hardwareCheck(['qwen3-4b', 'qwen3-1.7b'], { serverAvailable: true }),
    )
    vi.mocked(tauri.startAiSetup).mockResolvedValue(undefined)
    vi.mocked(tauri.deleteAiModel).mockResolvedValue(undefined)
    vi.mocked(openUrl).mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('AI polish uses', () => {
    it('has one Learn more on the header and Built-in picked for the Built-in preset', async () => {
      await renderPane()

      expect(within(engineCards()).getByRole('radio', { name: /Built-in/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      expect(
        within(engineCards()).getByRole('radio', { name: /Your server or API key/ }),
      ).toHaveTextContent('Ollama, OpenAI, Groq, OpenRouter…')
      const learnMore = screen.getAllByRole('button', { name: 'Learn more' })
      expect(learnMore).toHaveLength(1)
      fireEvent.click(learnMore[0])
      expect(openUrl).toHaveBeenCalledWith(GUIDE)
      // "Fetch available models" is gone.
      expect(screen.queryByRole('button', { name: /Fetch/ })).not.toBeInTheDocument()
    })

    it('Built-in details: the model cards, the hardware note and Not downloaded + Download', async () => {
      await renderPane()

      const settings = screen.getByTestId('builtin-settings')
      expect(within(settings).getByText('Apple M1 Pro · 32 GB')).toBeInTheDocument()
      expect(within(settings).getByRole('radio', { name: /Best quality/ })).toBeInTheDocument()
      const status = await within(settings).findByTestId('builtin-status')
      expect(within(status).getByText('Not downloaded')).toBeInTheDocument()
      expect(within(status).getByText('Best quality · 2.5 GB')).toBeInTheDocument()
      fireEvent.click(within(status).getByRole('button', { name: 'Download' }))
      expect(tauri.startAiSetup).toHaveBeenCalledWith('qwen3-4b')
    })

    it('a model in use shows In use, its detail and Delete (confirmed with a second click)', async () => {
      mockAppStore.config.ai_presets = [installedAiBuiltin('qwen3-4b', 7)]
      vi.mocked(tauri.listAiModels).mockResolvedValue([
        {
          id: 'qwen3-4b',
          fileName: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
          sizeBytes: 2_497_281_120,
          installed: true,
        },
      ])
      await renderPane()

      const status = await screen.findByTestId('builtin-status')
      await waitFor(() => expect(within(status).getByText('In use')).toBeInTheDocument())
      expect(within(status).getByText('Qwen3 4B Instruct · 2.5 GB')).toBeInTheDocument()
      fireEvent.click(within(status).getByRole('button', { name: 'Delete' }))
      fireEvent.click(within(status).getByRole('button', { name: 'Click again to delete' }))
      await waitFor(() => expect(tauri.deleteAiModel).toHaveBeenCalledWith('qwen3-4b'))
    })

    it('when no model suits this Mac, Built-in is dimmed and the server form shows', async () => {
      vi.mocked(tauri.getAiHardware).mockResolvedValue(
        hardwareCheck([], {
          chipKind: 'intel',
          chipName: 'Intel Core i7',
          leftOut: 'needs_apple_silicon',
          serverAvailable: true,
        }),
      )
      await renderPane()

      const builtin = within(engineCards()).getByRole('radio', { name: /Built-in/ })
      expect(builtin).toBeDisabled()
      expect(builtin).toHaveTextContent('Not available on this Mac')
      expect(
        within(engineCards()).getByRole('radio', { name: /Your server or API key/ }),
      ).toHaveAttribute('aria-checked', 'true')
      expect(screen.queryByTestId('builtin-settings')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
      expect(screen.getByTestId('server-settings')).toHaveTextContent('Add your server or API key')
    })

    it('picking the server option with a saved preset makes it the one in use', async () => {
      mockAppStore.config.ai_presets = [installedAiBuiltin('qwen3-4b', null), thinkingPreset]
      await renderPane()

      fireEvent.click(within(engineCards()).getByRole('radio', { name: /Your server or API key/ }))
      await waitFor(() =>
        expect(tauri.updateConfig).toHaveBeenCalledWith(
          expect.objectContaining({ active_ai_preset_id: 'pc-qwen35' }),
        ),
      )
    })
  })

  describe('Server details', () => {
    beforeEach(() => {
      mockAppStore.config.ai_presets = [installedAiBuiltin('qwen3-4b', null), thinkingPreset]
      mockAppStore.config.active_ai_preset_id = 'pc-qwen35'
    })

    it('shows the preset picker, the four fields and the extra fields under Advanced', async () => {
      await renderPane()

      const server = screen.getByTestId('server-settings')
      expect(within(server).getByRole('combobox', { name: 'Saved presets' })).toHaveValue(
        'pc-qwen35',
      )
      expect(within(server).getByLabelText('Address')).toHaveValue('http://192.0.2.10:11434/v1')
      expect(within(server).getByLabelText('Model')).toHaveValue('qwen3.5:4b')
      // Saved extra fields open Advanced so they are visible.
      expect(within(server).getByRole('button', { name: 'Advanced' })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      expect(within(server).getByLabelText('Extra fields')).toHaveValue(
        JSON.stringify({ reasoning_effort: 'none' }, null, 2),
      )
    })

    it('tests the preset with its extra fields and the typed key', async () => {
      vi.mocked(tauri.testAiPreset).mockResolvedValue(230)
      await renderPane()
      const server = screen.getByTestId('server-settings')

      fireEvent.change(within(server).getByLabelText('API key'), { target: { value: 'sk-1' } })
      fireEvent.click(within(server).getByRole('button', { name: 'Test' }))
      expect(await within(server).findByText('Works · 230 ms')).toBeInTheDocument()
      expect(tauri.testAiPreset).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'pc-qwen35',
          extra_request_fields: { reasoning_effort: 'none' },
        }),
        'sk-1',
      )
    })

    it('saves edited extra fields and the key under the preset id', async () => {
      await renderPane()
      const server = screen.getByTestId('server-settings')

      fireEvent.change(within(server).getByLabelText('Extra fields'), {
        target: { value: '{"temperature": 0.1}' },
      })
      fireEvent.change(within(server).getByLabelText('API key'), { target: { value: 'sk-2' } })
      fireEvent.click(within(server).getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
      expect(tauri.setCredential).toHaveBeenCalledWith('llm', 'pc-qwen35', 'sk-2')
      const saved = vi.mocked(tauri.updateConfig).mock.calls[0][0]
      expect(saved.ai_presets.find((preset) => preset.id === 'pc-qwen35')).toMatchObject({
        extra_request_fields: { temperature: 0.1 },
        verified_at: null,
      })
    })
  })

  describe('Polish', () => {
    it('shows the four styles as option cards with Clean picked', async () => {
      await renderPane()

      const styles = screen.getByRole('radiogroup', { name: 'Polish style' })
      expect(within(styles).getAllByRole('radio')).toHaveLength(4)
      expect(within(styles).getByRole('radio', { name: /Clean/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      fireEvent.click(within(styles).getByRole('radio', { name: /Structured/ }))
      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({ polish_style: 'structured' })
      expect(screen.queryByText('Custom polish instructions')).not.toBeInTheDocument()
    })

    it('"Clean up dictation" switches polish off and hides the styles', async () => {
      mockAppStore.config.polish_enabled = false
      await renderPane()

      expect(screen.getByRole('switch', { name: 'Clean up dictation' })).not.toBeChecked()
      expect(screen.getByText('Off pastes exactly what you said')).toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: 'Polish style' })).not.toBeInTheDocument()
    })
  })

  describe('Advanced', () => {
    it('is collapsed and holds selected text and custom instructions', async () => {
      await renderPane()

      const toggle = screen.getByRole('button', { name: 'Advanced' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('Custom instructions')).not.toBeInTheDocument()
      fireEvent.click(toggle)
      expect(
        screen.getByRole('switch', { name: 'Use selected text in Ask/polish' }),
      ).toBeInTheDocument()
      fireEvent.change(screen.getByRole('textbox', { name: 'Custom polish instructions' }), {
        target: { value: 'Keep a concise professional tone.' },
      })
      expect(mockAppStore.updateConfig).toHaveBeenCalledWith({
        polish_custom_prompt: 'Keep a concise professional tone.',
      })
    })

    it('keeps selected text reachable when cleanup is off', async () => {
      mockAppStore.config.polish_enabled = false
      await renderPane()

      fireEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      expect(
        screen.getByRole('switch', { name: 'Use selected text in Ask/polish' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Custom polish instructions' })).toBeNull()
    })

    it('opens by itself when custom instructions exist', async () => {
      mockAppStore.config.polish_custom_prompt = 'Keep it concise.'
      await renderPane()

      expect(screen.getByRole('textbox', { name: 'Custom polish instructions' })).toHaveValue(
        'Keep it concise.',
      )
    })
  })

  describe('Ask Anything', () => {
    it('keeps Ask Anything out of AI Polish settings', () => {
      render(<LlmPane />)

      expect(screen.queryByText('Ask anything')).not.toBeInTheDocument()
      expect(screen.queryByText('Voice question')).not.toBeInTheDocument()
    })
  })

  describe('Feature toggles', () => {
    it('keeps context adaptation adjacent to AI polish and disables it when polish is off', () => {
      mockAppStore.config.polish_enabled = false
      render(<LlmPane />)

      const contextSwitch = screen.getByRole('switch', {
        name: 'Match the app you’re in',
      })
      expect(contextSwitch).toBeDisabled()
    })

    it('updates the context adaptation preference', () => {
      render(<LlmPane />)
      const contextSwitch = screen.getByRole('switch', {
        name: 'Match the app you’re in',
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

    it('keeps the advanced toggles out of the default flow', () => {
      render(<LlmPane />)

      expect(screen.getByText('Email, chat and docs each get their own tone')).toBeInTheDocument()
      expect(screen.queryByText('Use selected text in Ask/polish')).not.toBeInTheDocument()
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

      // A link under "Match the app you're in", and the same item in the app's menu.
      const link = await screen.findByRole('button', { name: 'Manage app mappings' })
      fireEvent.click(await screen.findByRole('button', { name: 'App writing style' }))
      expect(screen.getAllByText('Manage app mappings')).toHaveLength(2)
      expect(screen.queryByText('Use a different writing style')).not.toBeInTheDocument()
      fireEvent.click(link)
      expect(await screen.findByRole('dialog', { name: 'Manage app mappings' })).toBeVisible()
      expect(screen.queryByText('Gmail')).not.toBeInTheDocument()
    })

    it('shows the translation language slots next to translation when enabled', () => {
      mockAppStore.config.translate_enabled = true
      mockAppStore.config.translation = { targets: ['en'], active_target: 'en' }

      render(<LlmPane />)
      expect(screen.getByRole('radiogroup', { name: 'Translation languages' })).toBeInTheDocument()
      // A single language stays single: no padding with other languages.
      expect(mockAppStore.updateConfig).not.toHaveBeenCalled()
    })

    it('shows the translation languages even when always-translate is off', () => {
      mockAppStore.config.translate_enabled = false

      render(<LlmPane />)
      expect(screen.getByRole('radiogroup', { name: 'Translation languages' })).toBeInTheDocument()
    })
  })
})
