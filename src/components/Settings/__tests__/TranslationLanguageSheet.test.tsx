import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as tauri from '../../../lib/tauri'
import {
  BUILTIN_AI_PRESET,
  useAppStore,
  type AppConfig,
  type TranslationLanguageSettings,
} from '../../../stores/appStore'
import { aiServerPreset } from '../../../test-utils/speechHardware'
import { deleteServerPreset } from '../../Speech/saveSpeech'
import { AI_SERVICE } from '../../Speech/services'
import { TranslationLanguageSheet } from '../TranslationLanguageSheet'
import { resetTranslationDefaultsCache } from '../translationLanguages'

vi.mock('../../../lib/tauri', () => ({
  getTranslationLanguageDefaults: vi.fn(),
  updateConfig: vi.fn(),
  setCredential: vi.fn(),
}))

vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

const HK_DEFAULT = 'Write colloquial written Cantonese.'
const JA_DEFAULT = 'Translate into Japanese.'
const pcPreset = aiServerPreset('pc', 'PC Ollama', 'http://192.0.2.10:11434/v1', 'qwen3:4b')

function setup(languages: Record<string, TranslationLanguageSettings> = {}) {
  const config: AppConfig = {
    ...useAppStore.getInitialState().config,
    ai_presets: [BUILTIN_AI_PRESET, pcPreset],
    translation: { targets: ['en', 'zh-Hant-HK', 'ja'], active_target: 'en', languages },
  }
  useAppStore.setState({ config, savedConfig: config })
}

function renderSheet(code = 'zh-Hant-HK') {
  const onClose = vi.fn()
  render(<TranslationLanguageSheet code={code} onClose={onClose} />)
  return onClose
}

function instructions() {
  return screen.getByLabelText('Instructions') as HTMLTextAreaElement
}

function lastSaved(): AppConfig {
  const calls = vi.mocked(tauri.updateConfig).mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  resetTranslationDefaultsCache()
  vi.mocked(tauri.getTranslationLanguageDefaults).mockResolvedValue({
    'zh-Hant-HK': HK_DEFAULT,
    ja: JA_DEFAULT,
    en: 'Translate into English.',
  })
  vi.mocked(tauri.updateConfig).mockResolvedValue(undefined)
  vi.mocked(tauri.setCredential).mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TranslationLanguageSheet', () => {
  it('opens on the defaults: same model as AI polish and the built-in instructions', async () => {
    setup()
    renderSheet()

    expect(screen.getByRole('dialog', { name: 'Chinese (Traditional, Hong Kong)' })).toBeVisible()
    expect(screen.getByLabelText('AI model')).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Same as AI polish' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Built-in (this Mac)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'PC Ollama' })).toBeInTheDocument()
    await waitFor(() => expect(instructions()).toHaveValue(HK_DEFAULT))
    expect(screen.getByText(`${HK_DEFAULT.length} / 2000 characters`)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument()
  })

  it('shows Reset to default only for custom text, and resets it', async () => {
    setup()
    renderSheet()
    await waitFor(() => expect(instructions()).toHaveValue(HK_DEFAULT))

    fireEvent.change(instructions(), { target: { value: 'Use formal written Chinese.' } })
    expect(screen.getByText('27 / 2000 characters')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(instructions()).toHaveValue(HK_DEFAULT)
    expect(screen.queryByRole('button', { name: 'Reset to default' })).not.toBeInTheDocument()
  })

  it('saves the model and the edited instructions at once, leaving other edits unsaved', async () => {
    setup()
    // An unsaved edit elsewhere in Settings stays unsaved.
    useAppStore.setState((state) => ({ config: { ...state.config, polish_style: 'minimal' } }))
    const onClose = renderSheet()
    await waitFor(() => expect(instructions()).toHaveValue(HK_DEFAULT))

    fireEvent.change(screen.getByLabelText('AI model'), { target: { value: 'pc' } })
    fireEvent.change(instructions(), { target: { value: '  Keep it casual.  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const expected = { 'zh-Hant-HK': { ai_preset_id: 'pc', instructions: 'Keep it casual.' } }
    expect(lastSaved().translation.languages).toEqual(expected)
    expect(lastSaved().polish_style).toBe('clean')
    const { config, savedConfig } = useAppStore.getState()
    expect(config.translation.languages).toEqual(expected)
    expect(savedConfig?.translation.languages).toEqual(expected)
    expect(config.polish_style).toBe('minimal')
  })

  it('stores nothing for a language saved back to its defaults', async () => {
    setup({ 'zh-Hant-HK': { ai_preset_id: 'pc', instructions: 'Mine.' } })
    renderSheet()
    expect(instructions()).toHaveValue('Mine.')
    expect(screen.getByLabelText('AI model')).toHaveValue('pc')

    fireEvent.change(screen.getByLabelText('AI model'), { target: { value: '' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Reset to default' })).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(tauri.updateConfig).toHaveBeenCalled())
    expect(lastSaved().translation.languages).toEqual({})
  })

  it('Cancel closes without saving', async () => {
    setup()
    const onClose = renderSheet('ja')
    await waitFor(() => expect(instructions()).toHaveValue(JA_DEFAULT))
    fireEvent.change(instructions(), { target: { value: 'Something else' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalled()
    expect(tauri.updateConfig).not.toHaveBeenCalled()
  })

  it('shows a deleted preset as Same as AI polish, with a note', async () => {
    setup({ 'zh-Hant-HK': { ai_preset_id: 'gone', instructions: null } })
    renderSheet()

    expect(screen.getByLabelText('AI model')).toHaveValue('')
    expect(
      screen.getByText(
        'The preset this language used was deleted, so it uses the AI polish model again.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(instructions()).toHaveValue(HK_DEFAULT))
  })

  it('deleting an AI preset sends the languages that used it back to Same as AI polish', async () => {
    setup({
      'zh-Hant-HK': { ai_preset_id: 'pc', instructions: null },
      ja: { ai_preset_id: 'pc', instructions: 'Polite.' },
    })

    await deleteServerPreset(AI_SERVICE, 'pc', BUILTIN_AI_PRESET.id)

    const { config, savedConfig } = useAppStore.getState()
    const expected = { ja: { ai_preset_id: null, instructions: 'Polite.' } }
    expect(config.translation.languages).toEqual(expected)
    expect(savedConfig?.translation.languages).toEqual(expected)
  })
})
