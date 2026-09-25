import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { SPEECH_SERVICES_GUIDE_URL } from '../../lib/speechTypes'

/**
 * "Learn more": opens a guide on GitHub in the browser, the speech services guide (plan
 * `two-tab-speech`) or, with `url`, the AI polish guide (plan `ai-polish-setup`).
 */
export function LearnMoreLink({ url = SPEECH_SERVICES_GUIDE_URL }: { url?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() =>
        openUrl(url).catch((error) => console.error('[settings] failed to open the guide', error))
      }
      className="link-button"
    >
      {t('speech.learnMore')}
    </button>
  )
}
