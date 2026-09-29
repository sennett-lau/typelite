import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AI_SERVICE } from '../Speech/services'
import { WebSearchForm } from '../WebSearch/WebSearchForm'
import { EngineSetupStep } from './SttSetupStep'

/**
 * Plan `ask-web-search`: an optional, collapsed card under the AI setup for Ask's web search.
 * Nothing needs it; Skip and Next ignore it.
 */
export function WebSearchCard() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-5" data-testid="onboarding-web-search">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="disclosure"
      >
        {t('webSearch.onboardingTitle')}
      </button>
      {open && (
        <div className="mt-2">
          <p className="m-0 mb-2.5 text-[12px] text-text-secondary">{t('webSearch.help')}</p>
          <WebSearchForm idPrefix="onboarding-web-search" />
        </div>
      )}
    </div>
  )
}

/**
 * Onboarding → AI polish (plan `ai-polish-setup`): the same card, sheet and links as the speech
 * step, for Built-in AI and "your own server or API key". Skipping keeps dictation working; it
 * pastes the raw transcript.
 */
export function LlmSetupStep({ onSkip }: { onSkip: () => void }) {
  return (
    <div>
      <EngineSetupStep service={AI_SERVICE} onSkip={onSkip} />
      <WebSearchCard />
    </div>
  )
}
