import type { ReactNode } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface NeedsLiveInfoProps {
  /** Answers from the model's own knowledge (with an "out of date" note). */
  onAnswerAnyway: () => void
  onClose: () => void
  /** True while the "Answer anyway" request runs. */
  answering?: boolean
  /**
   * A later plan adds a "Set up web search" action here. Nothing passes it yet, so nothing
   * extra is rendered; the button row already leaves room for it.
   */
  setupAction?: ReactNode
}

/**
 * Plan `ask-translate-and-live-questions`: the Ask panel state for a question that needs live
 * information.
 */
export function NeedsLiveInfo({
  onAnswerAnyway,
  onClose,
  answering = false,
  setupAction,
}: NeedsLiveInfoProps) {
  const { t } = useTranslation()
  return (
    <div data-testid="ask-needs-live-info" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Globe size={14} className="shrink-0 text-text-tertiary" />
        <p className="text-[13px] font-medium text-text-primary">{t('ask.liveTitle')}</p>
      </div>
      <p className="text-[12px] leading-5 text-text-secondary">{t('ask.liveBody')}</p>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {setupAction}
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-full border border-border bg-bg-secondary px-3 text-[12px] text-text-primary transition-colors hover:border-border-focus cursor-pointer"
        >
          {t('ask.close')}
        </button>
        <button
          type="button"
          onClick={onAnswerAnyway}
          disabled={answering}
          className="flex h-8 items-center gap-1.5 rounded-full border border-accent bg-accent px-3 text-[12px] font-medium text-on-accent transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        >
          {answering && <Loader2 size={12} className="animate-spin" />}
          {t('ask.answerAnyway')}
        </button>
      </div>
    </div>
  )
}
