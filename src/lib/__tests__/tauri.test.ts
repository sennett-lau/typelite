import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  addCorrectionRule,
  clearCredential,
  commitDictionaryImport,
  exportDictionaryCsv,
  exportDictionaryJson,
  getAiHardware,
  getCorrectionRules,
  getSttRecordingCapability,
  openSettingsPane,
  previewDictionaryImport,
  removeCorrectionRule,
  setCorrectionRuleEnabled,
  setShortcutTourState,
  startAiSetup,
  testAiPreset,
  testSpeechPreset,
  updateCorrectionRule,
  updateDictionaryEntry,
  waitForAccessibilityPermission,
} from '../tauri'
import { BUILTIN_SPEECH_PRESETS } from '../../stores/appStore'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('waitForAccessibilityPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns immediately when accessibility is already trusted', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)

    await expect(waitForAccessibilityPermission()).resolves.toBe(true)

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('check_accessibility_permission')
  })

  it('polls until accessibility becomes trusted', async () => {
    vi.useFakeTimers()
    vi.mocked(invoke).mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const result = waitForAccessibilityPermission({ timeoutMs: 1_000, intervalMs: 10 })
    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('returns false after the timeout expires', async () => {
    vi.useFakeTimers()
    vi.mocked(invoke).mockResolvedValue(false)

    const result = waitForAccessibilityPermission({ timeoutMs: 20, intervalMs: 10 })
    await vi.advanceTimersByTimeAsync(20)

    await expect(result).resolves.toBe(false)
    expect(invoke).toHaveBeenCalledTimes(3)
  })
})

describe('credential commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears credentials through the explicit backend command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await clearCredential('llm', 'openai')

    expect(invoke).toHaveBeenCalledWith('clear_credential', {
      namespace: 'llm',
      provider: 'openai',
    })
  })
})

describe('preset commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const speechPreset = {
    id: 'builtin-speech-local',
    name: 'whisper.cpp on this Mac',
    base_url: 'http://127.0.0.1:8178/v1',
    model: 'large-v3-turbo',
    language: 'auto',
    builtin: true,
    verified_at: null,
  }
  const aiPreset = {
    id: 'my-ollama',
    name: 'My Ollama',
    base_url: 'http://192.0.2.10:11434/v1',
    model: 'qwen3:4b-instruct-2507-q4_K_M',
    extra_request_fields: { reasoning_effort: 'none' },
    builtin: false,
    verified_at: null,
  }

  it('tests a speech preset and returns the latency', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(1800)

    await expect(testSpeechPreset(speechPreset, '')).resolves.toBe(1800)

    expect(invoke).toHaveBeenCalledWith('test_speech_preset', { preset: speechPreset, apiKey: '' })
  })

  it('tests an AI preset with its extra fields', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(120)

    await expect(testAiPreset(aiPreset, 'sk-x')).resolves.toBe(120)

    expect(invoke).toHaveBeenCalledWith('test_ai_preset', { preset: aiPreset, apiKey: 'sk-x' })
  })

  it('starts the Built-in AI setup and reads the AI hardware check', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await startAiSetup('qwen3-1.7b')
    expect(invoke).toHaveBeenCalledWith('start_ai_setup', { modelId: 'qwen3-1.7b' })

    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await startAiSetup()
    expect(invoke).toHaveBeenLastCalledWith('start_ai_setup', { modelId: null })

    vi.mocked(invoke).mockResolvedValueOnce({ serverAvailable: false })
    await expect(getAiHardware()).resolves.toEqual({ serverAvailable: false })
    expect(invoke).toHaveBeenLastCalledWith('get_ai_hardware')
  })

  it('saves the shortcut tour flags on their own', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await setShortcutTourState({ promptDismissed: true })

    expect(invoke).toHaveBeenCalledWith('set_shortcut_tour_state', {
      completed: null,
      promptDismissed: true,
    })
  })

  it('opens a Settings pane in the main window', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await openSettingsPane('stt')

    expect(invoke).toHaveBeenCalledWith('open_settings_pane', { pane: 'stt' })
  })

  it('resolves the recording limit from the mode, seconds and the preset on screen', async () => {
    vi.mocked(invoke).mockResolvedValue({})

    await getSttRecordingCapability('custom', 300)
    expect(invoke).toHaveBeenCalledWith('get_stt_recording_capability', {
      mode: 'custom',
      customSeconds: 300,
      preset: null,
    })

    const preset = BUILTIN_SPEECH_PRESETS[0]
    await getSttRecordingCapability('auto', 600, preset)
    expect(invoke).toHaveBeenCalledWith('get_stt_recording_capability', {
      mode: 'auto',
      customSeconds: 600,
      preset,
    })
  })
})

describe('dictionary correction commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads correction rules from the backend command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { id: 1, pattern: '拓肯', replacement: 'Token', enabled: true },
    ])

    await expect(getCorrectionRules()).resolves.toEqual([
      { id: 1, pattern: '拓肯', replacement: 'Token', enabled: true },
    ])

    expect(invoke).toHaveBeenCalledWith('get_correction_rules')
  })

  it('adds a correction rule through the backend command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await addCorrectionRule('拓肯', 'Token')

    expect(invoke).toHaveBeenCalledWith('add_correction_rule', {
      pattern: '拓肯',
      replacement: 'Token',
    })
  })

  it('removes a correction rule through the backend command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await removeCorrectionRule(7)

    expect(invoke).toHaveBeenCalledWith('remove_correction_rule', { id: 7 })
  })

  it('toggles a correction rule through the backend command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)

    await setCorrectionRuleEnabled(7, false)

    expect(invoke).toHaveBeenCalledWith('set_correction_rule_enabled', {
      id: 7,
      enabled: false,
    })
  })

  it('updates dictionary and correction rows through typed commands', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined)

    await updateDictionaryEntry(4, 'Typelite', 'type light')
    await updateCorrectionRule(7, 'type light', 'Typelite', false)

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_dictionary_entry', {
      id: 4,
      word: 'Typelite',
      pronunciation: 'type light',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'update_correction_rule', {
      id: 7,
      pattern: 'type light',
      replacement: 'Typelite',
      enabled: false,
    })
  })

  it('previews and commits identical import bytes and exports content only', async () => {
    const report = {
      accepted: 1,
      skippedDuplicates: 0,
      skippedInvalid: 0,
      errors: [],
    }
    vi.mocked(invoke)
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce(report)
      .mockResolvedValueOnce('{}')
      .mockResolvedValueOnce('type,word')

    await expect(previewDictionaryImport([65], 'txt')).resolves.toEqual(report)
    await expect(commitDictionaryImport([65], 'txt')).resolves.toEqual(report)
    await expect(exportDictionaryJson()).resolves.toBe('{}')
    await expect(exportDictionaryCsv()).resolves.toBe('type,word')

    expect(invoke).toHaveBeenNthCalledWith(1, 'preview_dictionary_import', {
      bytes: [65],
      format: 'txt',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'commit_dictionary_import', {
      bytes: [65],
      format: 'txt',
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'export_dictionary_json')
    expect(invoke).toHaveBeenNthCalledWith(4, 'export_dictionary_csv')
  })
})
