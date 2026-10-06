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
    expect(toSuperIntelligence('人工智慧、人工知能')).toBe('超級智慧、超知能')
    expect(toSuperIntelligence('Pulido con IA; KI-Glättung')).toBe('Pulido con SI; SI-Glättung')
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

  it.each(['en', 'zh', 'zh-Hant', 'es', 'fr', 'de', 'ja'])(
    'leaves its own hint readable in %s',
    async (language) => {
      await i18n.changeLanguage(language)
      setSiMode(true)
      expect(i18n.t('settings.siModeHint')).toBe(
        i18n.getResource(language, 'translation', 'settings.siModeHint'),
      )
      await i18n.changeLanguage('en')
    },
  )
})
