import { useTranslation } from 'react-i18next'
import { CapsuleWorking } from './CapsuleWorking'

/** Transcribing: the speech server is turning the recording into text. */
export function CapsuleProcessing() {
  const { t } = useTranslation()
  return (
    <CapsuleWorking label={t('capsule.transcribing')} cancelLabel={t('capsule.cancelProcessing')} />
  )
}
