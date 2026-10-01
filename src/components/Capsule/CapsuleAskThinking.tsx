import { useTranslation } from 'react-i18next'
import { Globe, MessageCircle } from 'lucide-react'
import { CapsuleWorking } from './CapsuleWorking'

/**
 * Ask is waiting for the AI's answer, or (plan `ask-web-search`) searching the web for a live
 * question first.
 */
export function CapsuleAskThinking({ searching }: { searching: boolean }) {
  const { t } = useTranslation()
  const Icon = searching ? Globe : MessageCircle

  return (
    <CapsuleWorking
      label={searching ? t('ask.searchingWeb') : t('ask.thinking')}
      icon={
        <>
          <Icon size={12} className="shrink-0 text-white/90" aria-hidden="true" />
          <span className="sr-only">{t('ask.title')}</span>
        </>
      }
    />
  )
}
