import { useTranslation } from 'react-i18next'
import { WebSearchSetup } from '../WebSearch/WebSearchSetup'

/**
 * Onboarding → Web search (plans `ask-web-search`, `searxng-setup`): an optional step right after
 * AI polish with the same two choices as Settings → Search. Next and Skip both move on; a Built-in
 * setup keeps running in the background.
 */
export function WebSearchStep({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-testid="onboarding-web-search" className="w-full">
      <WebSearchSetup idPrefix="onboarding-web-search" onboarding />
      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={onSkip} className="link-button link-button-muted">
          {t('onboarding.welcome.skipForNow')}
        </button>
      </div>
    </div>
  )
}
