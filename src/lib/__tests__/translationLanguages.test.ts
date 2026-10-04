import { describe, expect, it, vi } from 'vitest'
import {
  TARGET_LANGUAGE_SHORT_LABELS,
  TARGET_LANGUAGES,
  canonicalTranslationCode,
  targetLanguageLabel,
} from '../constants'
import { switchLanguageLabel, switchLanguageVariants } from '../switchLanguage'
import { translate } from '../../test-utils/i18nMock'

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

  it.each([
    ['zh-Hans', 'translate.languages.zhHans'],
    ['zh-Hant-HK', 'translate.languages.zhHantHK'],
    ['zh-Hant-TW', 'translate.languages.zhHantTW'],
  ])('localizes %s with its translation key', (code, key) => {
    const t = vi.fn(() => 'Localized name')
    expect(targetLanguageLabel(code, t)).toBe('Localized name')
    expect(t).toHaveBeenCalledExactlyOnceWith(key)
  })

  it('uses native names for other languages and preserves unknown codes', () => {
    const t = vi.fn()
    expect(targetLanguageLabel('ja', t)).toBe('日本語')
    expect(targetLanguageLabel('unknown-code', t)).toBe('unknown-code')
    expect(t).not.toHaveBeenCalled()
  })

  it('reads old plain Chinese as Simplified and matches codes case-insensitively', () => {
    expect(canonicalTranslationCode('zh')).toBe('zh-Hans')
    expect(canonicalTranslationCode(' ZH-hant-tw ')).toBe('zh-Hant-TW')
    expect(canonicalTranslationCode('EN')).toBe('en')
    expect(canonicalTranslationCode('xx')).toBeNull()
  })
})

describe('switch language key', () => {
  it('reads the key by its full name (bare Shift is either Shift key)', () => {
    const shift = { primary: 'Shift', modifiers: [] }
    expect(switchLanguageLabel(shift, translate)).toBe('Shift')
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
