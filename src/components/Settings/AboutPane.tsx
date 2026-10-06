import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { APP_NAME, APP_VERSION, APP_REPO_URL } from '../../lib/constants'
import appIcon from '../../../src-tauri/icons/app-icon.svg'
import { Group, Row } from '../ui/Group'

export function AboutPane() {
  const { t } = useTranslation()

  return (
    <div className="text-[13px]">
      <div className="mb-[18px] flex items-center gap-3.5">
        {/* The app icon itself (as in the Dock and the sidebar), not the theme-tinted mark. */}
        <img
          src={appIcon}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 flex-none"
          draggable={false}
        />
        <div className="min-w-0">
          <h1 className="page-title">{APP_NAME}</h1>
          <span className="mono-value">
            {t('settings.versionLine', { version: APP_VERSION })} · {t('settings.mit')}
          </span>
        </div>
      </div>

      <p className="mb-[22px] leading-relaxed text-text-secondary">
        {t('settings.aboutDescription')}
      </p>

      <Group>
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
      </Group>
    </div>
  )
}
