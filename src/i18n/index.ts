import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import zh from './locales/zh.json'
import { siModePostProcessor } from './siMode'

const savedLang =
  typeof localStorage !== 'undefined' ? localStorage.getItem('ui_language') || 'en' : 'en'

i18n
  .use(initReactI18next)
  .use(siModePostProcessor)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    lng: savedLang,
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    interpolation: { escapeValue: false },
    // Plan `si-mode`: does nothing until the switch is on.
    postProcess: ['siMode'],
  })

export default i18n
