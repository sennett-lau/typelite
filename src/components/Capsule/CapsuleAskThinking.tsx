import { useTranslation } from 'react-i18next'
import { MessageCircle } from 'lucide-react'
import { CapsuleWorking } from './CapsuleWorking'

/** Ask is waiting for the AI's answer. */
export function CapsuleAskThinking() {
  const { t } = useTranslation()

  return (
    <CapsuleWorking
      label={t('ask.thinking')}
      icon={
        <>
          <MessageCircle size={13} className="shrink-0 text-white/90" aria-hidden="true" />
          <span className="sr-only">{t('ask.title')}</span>
        </>
      }
    />
  )
}
