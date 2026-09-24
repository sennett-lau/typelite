import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import i18n from '../../i18n'
import { ExternalLink } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useAppStore } from '../../stores/appStore'
import { APP_NAME, APP_VERSION, APP_REPO_URL, UI_LANGUAGES } from '../../lib/constants'
import { BrandMark } from '../ui/BrandMark'
import { Group, Row } from '../ui/Group'

export function AboutPane() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)

  const currentLang = config.ui_language || i18n.language || 'en'

  const handleSelectLanguage = (value: string) => {
    i18n.changeLanguage(value)
    localStorage.setItem('ui_language', value)
    updateConfig({ ui_language: value })
    invoke('refresh_tray_labels').catch(() => {})
  }

  return (
    <div className="text-[13px]">
      <div className="mb-[18px] flex items-center gap-3.5">
        <span className="grid h-16 w-16 flex-none place-items-center rounded-[16px] bg-accent-light text-accent">
          <BrandMark size={44} />
        </span>
        <div className="min-w-0">
          <h1 className="page-title">{APP_NAME}</h1>
          <span className="mono-value">
            {t('settings.versionLine', { version: APP_VERSION.replace(/^v/, '') })} ·{' '}
            {t('settings.mit')}
          </span>
        </div>
      </div>

      <p className="mb-[22px] leading-relaxed text-text-secondary">
        {t('settings.aboutDescription')}
      </p>

      <Group>
        <Row label={t('settings.language')}>
          <select
            aria-label={t('settings.language')}
            value={currentLang}
            onChange={(event) => handleSelectLanguage(event.target.value)}
            className="popup"
          >
            {UI_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.github')}>
          <button
            type="button"
            onClick={() => openUrl(APP_REPO_URL)}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12px] text-accent"
          >
            {APP_REPO_URL.replace(/^https:\/\//, '')} <ExternalLink size={11} />
          </button>
        </Row>
        <Row label={t('settings.license')}>
          <span className="mono-value">{t('settings.mit')}</span>
        </Row>
        <Row label={t('settings.framework')}>
          <span className="mono-value">{t('settings.tauriReact')}</span>
        </Row>
      </Group>
    </div>
  )
}
