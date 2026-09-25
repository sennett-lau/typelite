import { useTranslation } from 'react-i18next'
import { CapsuleWorking } from './CapsuleWorking'

/** Polishing: the AI is cleaning up (or translating) the transcript. */
export function CapsulePolishing() {
  const { t } = useTranslation()
  return (
    <CapsuleWorking label={t('capsule.polishing')} cancelLabel={t('capsule.cancelPolishing')} />
  )
}
