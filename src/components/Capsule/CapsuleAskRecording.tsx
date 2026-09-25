import { useTranslation } from 'react-i18next'
import { MessageCircle, X } from 'lucide-react'
import { abortAskDictation } from '../../lib/tauri'
import { Waveform } from './Waveform'

export function CapsuleAskRecording() {
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
    <div className="relative z-10 flex h-full items-center gap-2 px-3">
      <MessageCircle size={13} className="shrink-0 text-white/90" aria-hidden="true" />
      <span className="sr-only">{t('ask.title')}</span>
      <Waveform />
      <div className="flex-1" />
      <button
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={handleCancel}
        aria-label={t('capsule.cancelRecording')}
        className="shrink-0 rounded-full border-none bg-transparent p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <X size={12} />
      </button>
    </div>
  )
}
