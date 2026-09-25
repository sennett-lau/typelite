import { describe, expect, it } from 'vitest'
import {
  TARGET_LANGUAGE_SHORT_LABELS,
  TARGET_LANGUAGES,
  canonicalTranslationCode,
  targetLanguageLabel,
} from '../constants'
import { switchLanguageLabel, switchLanguageVariants } from '../switchLanguage'
import { translate } from '../../test-utils/i18nMock'
import zh from '../../i18n/locales/zh.json'

describe('translation languages', () => {
  it('offers three Chinese variants instead of one Chinese', () => {
    const codes = TARGET_LANGUAGES.map((language) => language.value)
    expect(codes).toContain('zh-Hans')
    expect(codes).toContain('zh-Hant-HK')
    expect(codes).toContain('zh-Hant-TW')
    expect(codes).not.toContain('zh')
    expect(TARGET_LANGUAGE_SHORT_LABELS['zh-Hans']).toBe('简')
    expect(TARGET_LANGUAGE_SHORT_LABELS['zh-Hant-HK']).toBe('港')
    expect(TARGET_LANGUAGE_SHORT_LABELS['zh-Hant-TW']).toBe('台')
  })

  it('names the variants in the UI language', () => {
    expect(targetLanguageLabel('zh-Hans', translate)).toBe('Chinese (Simplified)')
    expect(targetLanguageLabel('zh-Hant-HK', translate)).toBe('Chinese (Traditional, Hong Kong)')
    expect(targetLanguageLabel('zh-Hant-TW', translate)).toBe('Chinese (Traditional, Taiwan)')
    expect(zh.translate.languages).toEqual({
      zhHans: '简体中文',
      zhHantHK: '繁體中文（香港）',
      zhHantTW: '繁體中文（台灣）',
    })
    expect(targetLanguageLabel('ja', translate)).toBe('日本語')
  })

  it('reads old plain Chinese as Simplified and matches codes case-insensitively', () => {
    expect(canonicalTranslationCode('zh')).toBe('zh-Hans')
    expect(canonicalTranslationCode(' ZH-hant-tw ')).toBe('zh-Hant-TW')
    expect(canonicalTranslationCode('EN')).toBe('en')
    expect(canonicalTranslationCode('xx')).toBeNull()
  })
})

describe('switch language key', () => {
  it('reads bare Shift as either Shift key', () => {
    const shift = { primary: 'Shift', modifiers: [] }
    expect(switchLanguageLabel(shift, translate)).toBe('Shift (either side)')
    expect(switchLanguageLabel({ primary: 'RightOption', modifiers: [] }, translate)).toBe(
      'Right Option',
    )
    expect(switchLanguageLabel(null, translate)).toBe('Off')
    expect(switchLanguageVariants(shift)).toEqual([
      { primary: 'LeftShift', modifiers: [] },
      { primary: 'RightShift', modifiers: [] },
    ])
  })
})
