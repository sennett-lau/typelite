import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { CapsuleWorking } from './CapsuleWorking'

/** Pasting: the text is going into the focused app. */
export function CapsulePasting() {
  const { t } = useTranslation()
  return <CapsuleWorking label={t('capsule.pasting')} />
}

/** Done: shown over the brief aurora flash after pasting, then the pill hides. */
export function CapsuleDone() {
  const { t } = useTranslation()
  return (
    <div className="relative z-10 flex h-full items-center justify-center gap-1.5 px-3">
      <Check size={14} className="text-white" aria-hidden="true" />
      <span className="text-[11px] font-medium leading-4 text-white">{t('capsule.done')}</span>
    </div>
  )
}
