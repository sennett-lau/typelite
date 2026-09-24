import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Row } from '../ui/Group'

/** Small pieces shared by the onboarding steps. Each step's content is a group of rows. */

/** A row with its label on top and the control below, full width. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row label={label} layout="stacked">
      {children}
    </Row>
  )
}

/** Shows the base URL and model of the chosen preset (read-only; edit them in Settings). */
export function PresetSummary({ baseUrl, model }: { baseUrl: string; model: string }) {
  const { t } = useTranslation()
  return (
    <>
      <Row label={t('settings.baseUrl')}>
        <span className="mono-value block max-w-[220px] truncate">{baseUrl}</span>
      </Row>
      <Row label={t('settings.model')}>
        <span className="mono-value block max-w-[220px] truncate">{model}</span>
      </Row>
    </>
  )
}

export function TestStatusHint({
  status,
  latencyMs,
  errorMessage,
  okKey,
  failKey,
}: {
  status: string
  latencyMs: number | null
  errorMessage: string | null
  okKey: string
  failKey: string
}) {
  const { t } = useTranslation()
  if (status === 'success') {
    return (
      <p className="mt-2 flex items-center gap-1 text-[12px] text-success">
        <CheckCircle2 size={13} /> {t(okKey)}
        {latencyMs !== null && ` · ${t('presets.latency', { ms: latencyMs })}`}
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div className="mt-2 flex items-start gap-1 text-[12px] text-error">
        <XCircle size={13} className="mt-[1px] flex-shrink-0" />
        <span>
          {t(failKey)}
          {errorMessage && `: ${errorMessage}`}
        </span>
      </div>
    )
  }
  return null
}
