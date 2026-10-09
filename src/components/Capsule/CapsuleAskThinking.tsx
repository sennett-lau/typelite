import { useTranslation } from 'react-i18next'
import { Globe, MessageCircle, Zap } from 'lucide-react'
import type { VoiceCommandPill } from '../../lib/tauri'
import { CapsuleWorking } from './CapsuleWorking'

/**
 * Ask is waiting for the AI's answer, or (plan `ask-web-search`) searching the web for a live
 * question first, or (plan `voice-commands`) carrying out a spoken command ("Opening Safari").
 */
export function CapsuleAskThinking({
  searching,
  command = null,
}: {
  searching: boolean
  command?: VoiceCommandPill | null
}) {
  const { t } = useTranslation()
  const Icon = command ? Zap : searching ? Globe : MessageCircle
  const label = command
    ? t(`voiceCommands.pill.${command.action}`, { target: command.target })
    : searching
      ? t('ask.searchingWeb')
      : t('ask.thinking')

  return (
    <CapsuleWorking
      label={label}
      icon={
        <>
          <Icon size={12} className="shrink-0 text-white/90" aria-hidden="true" />
          <span className="sr-only">{t('ask.title')}</span>
        </>
      }
    />
  )
}
