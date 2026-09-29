import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WebSearchForm } from '../WebSearch/WebSearchForm'

/**
 * Onboarding → Web search (plan `ask-web-search`): an optional step right after AI polish, laid
 * out like the AI step (a setup card, then "Skip for now"). Next and Skip both move on; nothing
 * needs a search provider.
 */
export function WebSearchStep({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-testid="onboarding-web-search">
      <div className="setup-card">
        <div className="flex items-start gap-3">
          <div className="setup-card-icon" aria-hidden="true">
            <Globe size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text-primary">
              {t('webSearch.onboardingTitle')}
              <span className="tag">{t('webSearch.optional')}</span>
            </h3>
            <p className="m-0 mt-[3px] text-[12.5px] leading-[1.45] text-text-secondary">
              {t('webSearch.help')}
            </p>
          </div>
        </div>
        <div className="setup-card-body">
          <WebSearchForm idPrefix="onboarding-web-search" />
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-end gap-3">
        <button type="button" onClick={onSkip} className="link-button link-button-muted">
          {t('onboarding.welcome.skipForNow')}
        </button>
      </div>
    </div>
  )
}
