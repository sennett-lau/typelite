import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { abortRecording } from '../../lib/tauri'

interface CapsuleWorkingProps {
  /** Short label shown over the aurora sweep ("Transcribing", "Polishing", "Pasting"). */
  label: string
  /** Aria label of the cancel button; without it the state has no cancel button. */
  cancelLabel?: string
  icon?: React.ReactNode
}

/**
 * A working state of the pill (plan 0009): a short white label over the aurora sweep, which
 * `Capsule` draws behind the content. No timer and no spinner; the sweep shows progress.
 */
export function CapsuleWorking({ label, cancelLabel, icon }: CapsuleWorkingProps) {
  const { t } = useTranslation()

  const handleCancel = async (event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await abortRecording()
    } catch (error) {
      console.error('Failed to cancel:', error)
    }
  }

  const stopPointerPropagation = (event: React.PointerEvent) => event.stopPropagation()

  return (
    <div className="relative z-10 flex h-full items-center gap-2 px-3">
      {icon}
      <p className="min-w-0 flex-1 truncate text-center text-[11px] font-medium leading-4 text-white">
        {label}
      </p>
      {cancelLabel && (
        <button
          onPointerDown={stopPointerPropagation}
          onPointerUp={stopPointerPropagation}
          onClick={handleCancel}
          aria-label={cancelLabel}
          title={t('capsule.cancelHint')}
          className="flex-shrink-0 cursor-pointer rounded-full border-none bg-transparent p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
