import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'

/** The result of a Test: the time after a pass, the reason after a failure. */
export function TestFeedback({
  status,
  latencyMs,
  errorMessage,
}: {
  status: string
  latencyMs: number | null
  errorMessage: string | null
}) {
  const { t } = useTranslation()
  if (status === 'success') {
    const time =
      latencyMs === null ? t('settings.connectionSuccess') : t('presets.latency', { ms: latencyMs })
    return (
      <span className="flex min-w-0 items-center gap-1 text-[12px] text-success">
        <CheckCircle2 size={12} className="flex-none" /> {time}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex min-w-0 items-start gap-1 text-[12px] text-error">
        <XCircle size={12} className="mt-[2px] flex-shrink-0" />
        <span className="min-w-0 break-words">
          {errorMessage || t('settings.connectionFailed')}
        </span>
      </span>
    )
  }
  return null
}
