import { describe, it, expect, beforeEach } from 'vitest'
import {
  findActivePreset,
  isDefaultLanguageSettings,
  languageSettings,
  useAppStore,
} from '../appStore'
import type { HotkeyConfig } from '../appStore'

function getState() {
  return useAppStore.getState()
}

describe('appStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useAppStore.setState(useAppStore.getInitialState())
  })

  describe('config', () => {
    it('starts with valid, unverified built-in presets and no stored secrets', () => {
      const { config } = getState()
      for (const [presets, activeId] of [
        [config.speech_presets, config.active_speech_preset_id],
        [config.ai_presets, config.active_ai_preset_id],
      ] as const) {
        const active = presets.find((preset) => preset.id === activeId)
        expect(active).toMatchObject({ kind: 'builtin', model_file: '', verified_at: null })
        expect(active?.base_url).toBe('')
      }
      expect(JSON.stringify(config)).not.toMatch(/api_key/)
      expect(config.translation.targets).toEqual([])
      expect(config.translation.active_target).toBe('')
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
      expect(config.ai_presets.map((preset) => preset.id)).toEqual(['builtin-ai-this-mac', 'copy'])
      expect(findActivePreset(config.ai_presets, config.active_ai_preset_id)).toBe(copy)
      expect(config.speech_presets).toHaveLength(1)
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
      expect(getState().onboardingStep).toBe(5)
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
        targets: ['fr'],
        active_target: 'fr',
        languages: {},
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
        languages: {},
      })
      expect(getState().config.target_lang).toBe('ja')

      // A fourth language replaces the last one.
      getState().updateConfig({ target_lang: 'ko' })
      expect(getState().config.translation).toEqual({
        targets: ['fr', 'ja', 'ko'],
        active_target: 'ko',
        languages: {},
      })
    })

    it('allows an empty language list, with no active target', () => {
      getState().updateConfig({ translation: { targets: ['en'], active_target: 'en' } })
      getState().updateConfig({ translation: { targets: [], active_target: 'en' } })
      expect(getState().config.translation).toEqual({
        targets: [],
        active_target: '',
        languages: {},
      })
      expect(getState().config.target_lang).toBe('')
    })

    it('migrates plain Chinese to Simplified Chinese and keeps the order and active target', () => {
      getState().updateConfig({
        translation: { targets: ['ja', 'zh', 'ZH-HANT-hk'], active_target: 'zh' },
      })
      expect(getState().config.translation).toEqual({
        targets: ['ja', 'zh-Hans', 'zh-Hant-HK'],
        active_target: 'zh-Hans',
        languages: {},
      })
      expect(getState().config.target_lang).toBe('zh-Hans')
    })

    it('keeps per-language translation settings when the language list changes', () => {
      const languages = { 'zh-Hant-HK': { instructions: null, enabled: false } }
      getState().setConfig({
        ...getState().config,
        translation: { targets: ['en', 'zh-Hant-HK'], active_target: 'en', languages },
      })
      // The chips and onboarding send the list without `languages`.
      getState().updateConfig({ translation: { targets: ['en'], active_target: 'en' } })
      expect(getState().config.translation.languages).toEqual(languages)
      getState().updateConfig({ target_lang: 'fr' })
      expect(getState().config.translation.languages).toEqual(languages)
    })

    it('applies saved language settings without touching unsaved list edits', () => {
      getState().setConfig({
        ...getState().config,
        translation: { targets: ['en', 'ja'], active_target: 'ja', languages: {} },
      })
      getState().setSavedConfig({
        ...getState().config,
        translation: { targets: ['en'], active_target: 'en', languages: {} },
      })
      const languages = { ja: { instructions: 'Use polite form.' } }
      getState().applyPersistedTranslationLanguages(languages)
      expect(getState().config.translation).toEqual({
        targets: ['en', 'ja'],
        active_target: 'ja',
        languages,
      })
      expect(getState().savedConfig?.translation.targets).toEqual(['en'])
      expect(getState().savedConfig?.translation.languages).toEqual(languages)
    })

    it('fills in language defaults and knows default settings', () => {
      const sha256 = 'a'.repeat(64)
      const config = {
        ...getState().config,
        translation: {
          targets: ['en', 'zh-Hant-HK'],
          active_target: 'en',
          languages: {
            'zh-Hant-HK': {
              instructions: null,
              library_preset: { id: 'cantonese-hong-kong', version: 2, sha256 },
              user_hints: ['得閒'],
            },
          },
        },
      }
      expect(languageSettings(config, 'en')).toEqual({
        instructions: null,
        library_preset: null,
        enabled: true,
        auto_update: false,
        user_hints: [],
      })
      expect(languageSettings(config, 'zh-Hant-HK').user_hints).toEqual(['得閒'])
      expect(isDefaultLanguageSettings(languageSettings(config, 'en'))).toBe(true)
      expect(isDefaultLanguageSettings(languageSettings(config, 'zh-Hant-HK'))).toBe(false)
      expect(isDefaultLanguageSettings({ instructions: null, enabled: false })).toBe(false)
      expect(isDefaultLanguageSettings({ instructions: null, auto_update: true })).toBe(false)
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
})
