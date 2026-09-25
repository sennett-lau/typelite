import { describe, it, expect, beforeEach } from 'vitest'
import { findActivePreset, useAppStore } from '../appStore'
import type { DictionaryEntry, CorrectionRule, HotkeyConfig } from '../appStore'

function getState() {
  return useAppStore.getState()
}

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState(useAppStore.getInitialState())
  })

  describe('pipeline state', () => {
    it('defaults to idle', () => {
      expect(getState().pipelineState).toBe('idle')
    })

    it('updates pipeline state', () => {
      getState().setPipelineState('recording')
      expect(getState().pipelineState).toBe('recording')
    })

    it('tracks the last structured insert result', () => {
      expect(getState().lastInsertResult).toBeNull()

      getState().setLastInsertResult({
        status: 'inserted',
        strategyUsed: 'keyboard',
        charsInserted: 5,
        charsCopied: 0,
        warningCode: null,
        message: null,
      })

      expect(getState().lastInsertResult).toEqual({
        status: 'inserted',
        strategyUsed: 'keyboard',
        charsInserted: 5,
        charsCopied: 0,
        warningCode: null,
        message: null,
      })
    })
  })

  describe('config', () => {
    it('has sensible defaults', () => {
      const { config } = getState()
      const isMac =
        typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
      const isWindows =
        typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('WIN')
      expect(config.theme).toBe('system')
      expect(config.hotkey).toBe(isMac ? 'Fn' : 'Ctrl+/')
      expect(config.ask_hotkey).toBe(isMac ? 'Fn+Space' : 'Ctrl+.')
      expect(config.hotkeys.dictation).toEqual(
        isMac ? { primary: 'Fn', modifiers: [] } : { primary: '/', modifiers: ['Ctrl'] },
      )
      expect(config.hotkeys.ask).toEqual(
        isMac ? { primary: 'Space', modifiers: ['Fn'] } : { primary: '.', modifiers: ['Ctrl'] },
      )
      expect(config.hotkeys.dictationBindings).toEqual([config.hotkeys.dictation])
      expect(config.hotkeys.askBindings).toEqual([config.hotkeys.ask])
      expect(config.hotkeys.translateBindings).toEqual(
        config.hotkeys.translate ? [config.hotkeys.translate] : [],
      )
      expect(config.hotkeys.dictationMode).toBe(isMac || isWindows ? 'toggle' : 'hold')
      expect(config.output_mode).toBe('keyboard')
      expect(config.insertion_strategy).toBe('auto')
      expect(config.windows_sendinput_newline_mode).toBe('enter')
      expect(config.polish_enabled).toBe(true)
      expect(config.polish_style).toBe('clean')
      expect(config.polish_custom_prompt).toBe('')
      expect(config.polish_chinese_script).toBe('preserve')
      expect(config.custom_scenes).toEqual([])
      expect(config.active_scene).toBeNull()
      expect(config.translation).toEqual({ targets: ['en'], active_target: 'en' })
      expect(config.hotkeys.switchLanguage).toEqual({ primary: 'Shift', modifiers: [] })
      expect(config.target_lang).toBe('en')
      expect(config.speech_presets.map((preset) => preset.id)).toEqual([
        'builtin-speech-local',
        'builtin-speech-lan',
        'builtin-speech-openai',
        'builtin-speech-groq',
      ])
      expect(config.speech_presets[0]).toEqual({
        id: 'builtin-speech-local',
        name: 'whisper.cpp on this Mac',
        base_url: 'http://127.0.0.1:8178/v1',
        model: 'large-v3-turbo',
        language: 'auto',
        builtin: true,
        verified_at: null,
      })
      expect(config.active_speech_preset_id).toBe('builtin-speech-local')
      expect(config.ai_presets.map((preset) => preset.id)).toEqual([
        'builtin-ai-ollama-local',
        'builtin-ai-ollama-lan',
        'builtin-ai-openai',
        'builtin-ai-groq',
      ])
      expect(config.ai_presets[0]).toEqual({
        id: 'builtin-ai-ollama-local',
        name: 'Ollama on this Mac',
        base_url: 'http://127.0.0.1:11434/v1',
        model: 'qwen3:4b-instruct-2507-q4_K_M',
        extra_request_fields: {},
        builtin: true,
        verified_at: null,
      })
      expect(config.active_ai_preset_id).toBe('builtin-ai-ollama-local')
      expect(config.ai_presets[1].base_url).toBe('http://<computer-ip>:11434/v1')
      expect(config.shortcut_tour_completed).toBe(false)
      expect(config.shortcut_tour_prompt_dismissed).toBe(false)
      expect(JSON.stringify(config)).not.toMatch(/api_key/)
      expect(config.show_in_dock).toBe(true)
      expect(config.mute_output_while_recording).toBe(false)
      expect(config.auto_start).toBe(true)
    })

    it('setConfig replaces entire config', () => {
      const newConfig = { ...getState().config, theme: 'dark' as const }
      getState().setConfig(newConfig)
      expect(getState().config.theme).toBe('dark')
    })

    it('updateConfig merges partial config immutably', () => {
      const original = getState().config
      getState().updateConfig({ theme: 'dark' })
      const updated = getState().config

      expect(updated.theme).toBe('dark')
      expect(updated.hotkey).toBe(original.hotkey) // unchanged
      expect(updated).not.toBe(original) // new object
    })

    it('updateConfig replaces the preset lists and active ids', () => {
      const copy = { ...getState().config.ai_presets[0], id: 'copy', builtin: false }
      getState().updateConfig({
        ai_presets: [...getState().config.ai_presets, copy],
        active_ai_preset_id: 'copy',
      })

      const { config } = getState()
      expect(config.ai_presets.map((preset) => preset.id)).toEqual([
        'builtin-ai-ollama-local',
        'builtin-ai-ollama-lan',
        'builtin-ai-openai',
        'builtin-ai-groq',
        'copy',
      ])
      expect(findActivePreset(config.ai_presets, config.active_ai_preset_id)).toBe(copy)
      expect(config.speech_presets).toHaveLength(4)
    })

    it('updateConfig clears the test result of a preset whose connection changed', () => {
      const tested = { ...getState().config.speech_presets[0], verified_at: 100 }
      getState().setConfig({
        ...getState().config,
        speech_presets: [tested, ...getState().config.speech_presets.slice(1)],
      })

      // A rename keeps it.
      getState().updateConfig({
        speech_presets: getState().config.speech_presets.map((preset, index) =>
          index === 0 ? { ...preset, name: 'Renamed' } : preset,
        ),
      })
      expect(getState().config.speech_presets[0].verified_at).toBe(100)

      // A new model clears it.
      getState().updateConfig({
        speech_presets: getState().config.speech_presets.map((preset, index) =>
          index === 0 ? { ...preset, model: 'other' } : preset,
        ),
      })
      expect(getState().config.speech_presets[0].verified_at).toBeNull()
    })

    it('updateConfig clears an AI test result when the extra fields change', () => {
      const tested = { ...getState().config.ai_presets[0], verified_at: 100 }
      getState().setConfig({ ...getState().config, ai_presets: [tested] })

      getState().updateConfig({
        ai_presets: [{ ...tested, extra_request_fields: { reasoning_effort: 'none' } }],
      })
      expect(getState().config.ai_presets[0].verified_at).toBeNull()
    })

    it('startShortcutTour opens onboarding at the Dictate step', () => {
      getState().setOnboardingCompleted(true)
      getState().startShortcutTour()
      expect(getState().onboardingCompleted).toBe(false)
      expect(getState().onboardingTour).toBe(true)
      expect(getState().onboardingStep).toBe(4)
    })

    it('findActivePreset falls back to the first preset for an unknown id', () => {
      const { speech_presets } = getState().config
      expect(findActivePreset(speech_presets, 'missing')).toBe(speech_presets[0])
      expect(findActivePreset([], 'missing')).toBeUndefined()
    })

    it('updateConfig keeps legacy and typed hotkey fields in sync', () => {
      getState().updateConfig({
        hotkey: 'Ctrl+Shift+;',
        ask_hotkey: 'Ctrl+.',
        hotkey_mode: 'toggle',
      })

      const { config } = getState()
      expect(config.hotkeys.dictation).toEqual({
        primary: ';',
        modifiers: ['Ctrl', 'Shift'],
      })
      expect(config.hotkeys.ask).toEqual({
        primary: '.',
        modifiers: ['Ctrl'],
      })
      expect(config.hotkeys.dictationMode).toBe('toggle')
    })

    it('updateConfig keeps native single-key hotkeys in sync', () => {
      getState().updateConfig({
        hotkey: 'RightAlt',
        ask_hotkey: 'Ctrl+.',
        hotkey_mode: 'toggle',
      })

      const { config } = getState()
      expect(config.hotkey).toBe('RightAlt')
      expect(config.hotkeys.dictation).toEqual({
        primary: 'RightAlt',
        modifiers: [],
      })
      expect(config.hotkeys.dictationMode).toBe('toggle')
    })

    it('updateConfig keeps disabled typed Ask hotkey disabled in legacy fields', () => {
      getState().updateConfig({
        hotkeys: {
          ...getState().config.hotkeys,
          ask: null,
        },
      })

      const { config } = getState()
      expect(config.hotkeys.ask).toBeNull()
      expect(config.ask_hotkey).toBe('')
    })

    it('updateConfig treats empty legacy Ask hotkey as disabled', () => {
      getState().updateConfig({ ask_hotkey: '' })

      const { config } = getState()
      expect(config.ask_hotkey).toBe('')
      expect(config.hotkeys.ask).toBeNull()
    })

    it('normalizes ordered hotkey binding lists and mirrors index zero', () => {
      getState().updateConfig({
        hotkeys: {
          ...getState().config.hotkeys,
          dictationBindings: [
            { primary: 'D', modifiers: ['Shift', 'control'] },
            { primary: 'D', modifiers: ['Ctrl', 'Shift'] },
            { primary: 'F8', modifiers: [] },
            { primary: 'F9', modifiers: [] },
            { primary: 'F10', modifiers: [] },
          ],
          askBindings: [],
          translateBindings: [
            { primary: 'T', modifiers: ['Ctrl', 'Shift'] },
            { primary: 'F7', modifiers: [] },
          ],
        },
      })

      const { config } = getState()
      expect(config.hotkeys.dictationBindings).toEqual([
        { primary: 'D', modifiers: ['Ctrl', 'Shift'] },
        { primary: 'F8', modifiers: [] },
        { primary: 'F9', modifiers: [] },
      ])
      expect(config.hotkeys.dictation).toEqual(config.hotkeys.dictationBindings[0])
      expect(config.hotkey).toBe('Ctrl+Shift+D')
      expect(config.hotkeys.askBindings).toEqual([])
      expect(config.hotkeys.ask).toBeNull()
      expect(config.ask_hotkey).toBe('')
      expect(config.hotkeys.translate).toEqual(config.hotkeys.translateBindings[0])
    })

    it('wraps legacy hotkeys into binding lists', () => {
      getState().updateConfig({
        hotkey: 'Ctrl+Shift+;',
        ask_hotkey: '',
        hotkey_mode: 'toggle',
      })

      const { hotkeys } = getState().config
      expect(hotkeys.dictationBindings).toEqual([{ primary: ';', modifiers: ['Ctrl', 'Shift'] }])
      expect(hotkeys.askBindings).toEqual([])
      expect(hotkeys.dictationMode).toBe('toggle')
    })

    it('keeps ordered translation targets and the legacy target mirror in sync', () => {
      getState().updateConfig({ target_lang: 'fr' })
      expect(getState().config.translation).toEqual({
        targets: ['en', 'fr'],
        active_target: 'fr',
      })

      // At most three, unique and supported.
      getState().updateConfig({
        translation: {
          targets: ['fr', 'fr', 'xx', 'ja', 'de', 'es', 'pt', 'it'],
          active_target: 'ja',
        },
      })
      expect(getState().config.translation).toEqual({
        targets: ['fr', 'ja', 'de'],
        active_target: 'ja',
      })
      expect(getState().config.target_lang).toBe('ja')

      // A fourth language replaces the last one.
      getState().updateConfig({ target_lang: 'ko' })
      expect(getState().config.translation).toEqual({
        targets: ['fr', 'ja', 'ko'],
        active_target: 'ko',
      })
    })

    it('migrates plain Chinese to Simplified Chinese and keeps the order and active target', () => {
      getState().updateConfig({
        translation: { targets: ['ja', 'zh', 'ZH-HANT-hk'], active_target: 'zh' },
      })
      expect(getState().config.translation).toEqual({
        targets: ['ja', 'zh-Hans', 'zh-Hant-HK'],
        active_target: 'zh-Hans',
      })
      expect(getState().config.target_lang).toBe('zh-Hans')
    })

    it('fills in the default Switch language key for configs without one', () => {
      const { switchLanguage: _dropped, ...olderHotkeys } = getState().config.hotkeys
      getState().setConfig({
        ...getState().config,
        hotkeys: olderHotkeys as HotkeyConfig,
      })
      expect(getState().config.hotkeys.switchLanguage).toEqual({ primary: 'Shift', modifiers: [] })

      getState().updateConfig({ hotkeys: { ...getState().config.hotkeys, switchLanguage: null } })
      expect(getState().config.hotkeys.switchLanguage).toBeNull()
    })
  })

  describe('dictionary', () => {
    it('defaults to empty array', () => {
      expect(getState().dictionary).toEqual([])
      expect(getState().correctionRules).toEqual([])
    })

    it('setDictionary replaces dictionary', () => {
      const entries: DictionaryEntry[] = [{ id: 1, word: 'API', pronunciation: null }]
      getState().setDictionary(entries)
      expect(getState().dictionary).toHaveLength(1)
      expect(getState().dictionary[0].word).toBe('API')
    })

    it('setCorrectionRules replaces correction rules', () => {
      const rules: CorrectionRule[] = [
        { id: 1, pattern: '拓肯', replacement: 'Token', enabled: true },
      ]
      getState().setCorrectionRules(rules)
      expect(getState().correctionRules).toHaveLength(1)
      expect(getState().correctionRules[0].replacement).toBe('Token')
    })
  })

  describe('recording state', () => {
    it('resetRecording clears all recording fields', () => {
      getState().setAudioVolume(0.8)
      getState().setPartialTranscript('partial')
      getState().setFinalTranscript('final')
      getState().setPolishedText('polished')
      getState().setRecordingDuration(5000)

      getState().resetRecording()

      expect(getState().audioVolume).toBe(0)
      expect(getState().partialTranscript).toBe('')
      expect(getState().finalTranscript).toBe('')
      expect(getState().polishedText).toBe('')
      expect(getState().recordingDuration).toBe(0)
    })

    it('appendPolishedChunk appends to existing text', () => {
      getState().setPolishedText('Hello')
      getState().appendPolishedChunk(' world')
      expect(getState().polishedText).toBe('Hello world')
    })
  })

  describe('savedConfig / resetConfig', () => {
    it('applyPersistedConfigPatch updates config and savedConfig for patched fields', () => {
      const saved = { ...getState().config, show_in_dock: false }
      getState().setSavedConfig(saved)
      getState().applyPersistedConfigPatch({ show_in_dock: true })

      expect(getState().config.show_in_dock).toBe(true)
      expect(getState().savedConfig?.show_in_dock).toBe(true)
    })

    it('applyPersistedConfigPatch preserves unrelated dirty fields', () => {
      const saved = { ...getState().config, theme: 'system' as const, show_in_dock: false }
      getState().setSavedConfig(saved)
      getState().updateConfig({ theme: 'dark' })

      getState().applyPersistedConfigPatch({ show_in_dock: true })

      expect(getState().config.theme).toBe('dark')
      expect(getState().savedConfig?.theme).toBe('system')
      expect(getState().config.show_in_dock).toBe(true)
      expect(getState().savedConfig?.show_in_dock).toBe(true)
    })

    it('applyPersistedConfigPatch lets persisted patch win for the same dirty field', () => {
      const saved = { ...getState().config, show_in_dock: false }
      getState().setSavedConfig(saved)
      getState().updateConfig({ show_in_dock: true })

      getState().applyPersistedConfigPatch({ show_in_dock: false })

      expect(getState().config.show_in_dock).toBe(false)
      expect(getState().savedConfig?.show_in_dock).toBe(false)
    })

    it('resetConfig restores to savedConfig', () => {
      const saved = { ...getState().config }
      getState().setSavedConfig(saved)

      getState().updateConfig({ theme: 'dark', polish_enabled: false })
      expect(getState().config.theme).toBe('dark')

      getState().resetConfig()
      expect(getState().config.theme).toBe('system')
      expect(getState().config.polish_enabled).toBe(true)
    })

    it('resetConfig is a no-op when savedConfig is null', () => {
      getState().updateConfig({ theme: 'dark' })
      getState().resetConfig()
      // Should remain dark since savedConfig is null
      expect(getState().config.theme).toBe('dark')
    })
  })

  describe('onboarding', () => {
    it('defaults to not completed', () => {
      expect(getState().onboardingCompleted).toBe(false)
      expect(getState().onboardingStep).toBe(0)
    })

    it('tracks onboarding progress', () => {
      getState().setOnboardingStep(2)
      getState().setOnboardingCompleted(true)
      expect(getState().onboardingStep).toBe(2)
      expect(getState().onboardingCompleted).toBe(true)
    })
  })
})
