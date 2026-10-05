import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../index'
import { isSiModeEnabled, setSiMode, toSuperIntelligence } from '../siMode'

describe('SI mode (plan `si-mode`)', () => {
  afterEach(() => setSiMode(false))

  it('renames AI and artificial intelligence, whole words only', () => {
    expect(toSuperIntelligence('AI polish')).toBe('SI polish')
    expect(toSuperIntelligence('Settings → AI')).toBe('Settings → SI')
    expect(toSuperIntelligence('OpenAI, AIFF and MAIL')).toBe('OpenAI, AIFF and MAIL')
    expect(toSuperIntelligence('Artificial intelligence and artificial intelligence')).toBe(
      'Super intelligence and super intelligence',
    )
    expect(toSuperIntelligence('AI 润色，人工智能')).toBe('SI 润色，超级智能')
  })

  it('changes translated text only while the switch is on', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('home.aiPolish')).toBe('AI Polish')
    setSiMode(true)
    expect(isSiModeEnabled()).toBe(true)
    expect(i18n.t('home.aiPolish')).toBe('SI Polish')
    setSiMode(false)
    expect(i18n.t('home.aiPolish')).toBe('AI Polish')
  })

  it('leaves its own hint readable', () => {
    setSiMode(true)
    expect(i18n.t('settings.siModeHint')).toBe(
      i18n.getResource('en', 'translation', 'settings.siModeHint'),
    )
  })
})
