import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SPEECH_SERVICES_GUIDE_URL } from '../../lib/speechTypes'

/**
 * "Learn more": opens the speech services guide on GitHub in the browser (plan `two-tab-speech`).
 */
export function LearnMoreLink() {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() =>
        openUrl(SPEECH_SERVICES_GUIDE_URL).catch((error) =>
          console.error('[speech] failed to open the services guide', error),
        )
      }
      className="link-button"
    >
      {t('speech.learnMore')}
    </button>
  )
}
