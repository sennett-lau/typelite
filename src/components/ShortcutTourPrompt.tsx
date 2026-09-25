import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'
import {
  dismissShortcutTourPrompt as dismissPrompt,
  startShortcutTour,
  useShortcutTourAvailable,
} from '../lib/shortcutTour'

/**
 * The first time both services are ready while the shortcut tour was skipped, this dialog
 * offers it. "Later" hides it for good; Home keeps a "Take the shortcut tour" link instead.
 */
export function ShortcutTourPrompt() {
  const { t } = useTranslation()
  const available = useShortcutTourAvailable()
  const dismissed = useAppStore((s) => s.config.shortcut_tour_prompt_dismissed)
  const open = available && !dismissed

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismissPrompt()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  const handleStart = () => {
    dismissPrompt()
    startShortcutTour()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
      <div className="fixed inset-0" onClick={dismissPrompt} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('tour.title')}
        className="relative z-10 w-full max-w-[380px] dialog"
      >
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[14px] font-medium text-text-primary">{t('tour.title')}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">{t('tour.body')}</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3">
          <button type="button" onClick={dismissPrompt} className="btn-secondary">
            {t('tour.later')}
          </button>
          <button type="button" autoFocus onClick={handleStart} className="btn-accent">
            {t('tour.start')}
          </button>
        </div>
      </div>
    </div>
  )
}
