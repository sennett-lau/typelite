import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { openSettingsPane } from '../../lib/tauri'

/** How long a plain error stays; a setup message with a button stays longer to be clicked. */
const ERROR_MS = 2500
const SETUP_ERROR_MS = 6000

interface CapsuleErrorProps {
  /**
   * The message and whether it has a "Set up" button, as last shown. They stay while the pill
   * hides after the error was cleared (plan `copy-when-no-field`), so the text does not change mid-
   * fade.
   */
  message?: string | null
  hasAction?: boolean
}

export function CapsuleError({ message, hasAction }: CapsuleErrorProps = {}) {
  const { t } = useTranslation()
  const pipelineError = useAppStore((s) => s.pipelineError)
  const action = useAppStore((s) => s.pipelineErrorAction)
  const shownMessage = pipelineError ?? message ?? null
  const showAction = action !== null || hasAction === true
  const setPipelineError = useAppStore((s) => s.setPipelineError)
  const resetRecording = useAppStore((s) => s.resetRecording)

  useEffect(() => {
    const timer = setTimeout(
      () => {
        setPipelineError(null)
        // Only reset recording state if the pipeline is actually idle.
        // If the user started a new recording during the error window,
        // don't overwrite the active pipeline state.
        const currentState = useAppStore.getState().pipelineState
        if (currentState === 'idle') {
          resetRecording()
        }
      },
      action ? SETUP_ERROR_MS : ERROR_MS,
    )
    return () => clearTimeout(timer)
  }, [setPipelineError, resetRecording, pipelineError, action])

  const handleSetUp = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!action) return
    openSettingsPane(action).catch((error) => console.error('Failed to open Settings:', error))
    setPipelineError(null)
  }

  return (
    <motion.div
      className="relative z-10 flex items-center gap-2 h-full px-3"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* White dot */}
      <motion.div className="w-2 h-2 rounded-full bg-white/80 flex-shrink-0" />
      <p className="text-[11px] leading-4 text-white truncate flex-1">
        {shownMessage || t('capsule.errors.unknown')}
      </p>
      {showAction && (
        <button
          type="button"
          onPointerUp={(event) => event.stopPropagation()}
          onClick={handleSetUp}
          className="flex-none cursor-pointer rounded-full border-none bg-[var(--color-pill-chip)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-pill-chip-text)]"
        >
          {t('capsule.setUp')}
        </button>
      )}
    </motion.div>
  )
}
