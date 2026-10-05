import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { UI_LANGUAGES } from './languages'
import { siModePostProcessor } from './siMode'

const savedLang =
  typeof localStorage !== 'undefined' ? localStorage.getItem('ui_language') || 'en' : 'en'

i18n
  .use(initReactI18next)
  .use(siModePostProcessor)
  .init({
    resources: Object.fromEntries(
      UI_LANGUAGES.map((language) => [language.value, { translation: language.messages }]),
    ),
    lng: savedLang,
    // A string missing from a table shows in English. `zh-Hant` must not fall back to the
    // Simplified table, so the fallback is explicit.
    fallbackLng: { 'zh-Hant': ['en'], default: ['en'] },
    supportedLngs: UI_LANGUAGES.map((language) => language.value),
    // `zh-Hant` is a whole code here, not `zh` plus a region.
    load: 'currentOnly',
    nonExplicitSupportedLngs: false,
    interpolation: { escapeValue: false },
    // Plan `si-mode`: does nothing until the switch is on.
    postProcess: ['siMode'],
  })

export default i18n
