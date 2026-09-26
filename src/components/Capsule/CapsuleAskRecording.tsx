import { useTranslation } from 'react-i18next'
import { MessageCircle, X } from 'lucide-react'
import { abortAskDictation } from '../../lib/tauri'
import { Waveform } from './Waveform'

interface CapsuleAskRecordingProps {
  /**
   * Plan `ask-panel-above-pill`: the start of the highlighted text this Ask includes, shown as an
   * "About …" chip; null without a highlight.
   */
  selectionPreview?: string | null
}

export function CapsuleAskRecording({ selectionPreview = null }: CapsuleAskRecordingProps) {
  const { t } = useTranslation()

  const handleCancel = async (event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await abortAskDictation()
    } catch (error) {
      console.error('Failed to abort Ask recording:', error)
    }
  }

  const stopPointerPropagation = (event: React.PointerEvent) => {
    event.stopPropagation()
  }

  return (
    <div className="relative z-10 flex h-full items-center gap-2 pl-3.5 pr-3">
      <MessageCircle size={13} className="shrink-0 text-white/90" aria-hidden="true" />
      <span className="sr-only">{t('ask.title')}</span>
      <Waveform />
      {selectionPreview && (
        <span
          className="max-w-[150px] shrink truncate rounded-full bg-white/15 px-2 py-0.5 text-[11px] leading-4 text-white/90"
          title={t('ask.aboutSelectionHint')}
          data-testid="ask-selection-chip"
        >
          {t('ask.aboutSelection', { text: selectionPreview })}
        </span>
      )}
      <div className="flex-1" />
      <button
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={handleCancel}
        aria-label={t('capsule.cancelRecording')}
        title={t('capsule.cancelHint')}
        className="shrink-0 rounded-full border-none bg-transparent p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X size={12} />
      </button>
    </div>
  )
}
