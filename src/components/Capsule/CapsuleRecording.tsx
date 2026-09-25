import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { abortRecording } from '../../lib/tauri'
import { Waveform } from './Waveform'
import { TranslateTargetChips } from './TranslateTargetChips'

export function CapsuleRecording() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await abortRecording()
    } catch (err) {
      console.error('Failed to abort recording:', err)
    }
  }

  const stopPointerPropagation = (e: React.PointerEvent) => {
    e.stopPropagation()
  }

  return (
    <motion.div className="relative z-10 flex items-center gap-2 h-full px-3">
      {/* Recording dot — gentle opacity loop */}
      <motion.div
        className="w-2 h-2 rounded-full bg-recording flex-shrink-0"
        animate={reduced ? undefined : { opacity: [1, 0.5, 1] }}
        transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
      />
      <Waveform />
      <TranslateTargetChips />
      <div className="flex-1" />
      <button
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={handleCancel}
        aria-label={t('capsule.cancelRecording')}
        title={t('capsule.cancelHint')}
        className="flex-shrink-0 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-colors bg-transparent border-none cursor-pointer"
      >
        <X size={12} />
      </button>
    </motion.div>
  )
}
