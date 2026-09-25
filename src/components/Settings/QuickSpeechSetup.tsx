import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react'
import { cancelSpeechSetup } from '../../lib/tauri'
import { beginSpeechSetup, useSpeechSetupStatus } from '../../hooks/useSpeechSetup'
import {
  DEFAULT_SETUP_MODEL,
  MODEL_SIZE_BYTES,
  SMALL_SETUP_MODEL,
  formatMegabytes,
  formatSpeed,
  formatTimeLeft,
  progressPercent,
  secondsLeft,
  setupErrorMessage,
} from '../../lib/speechSetup'
import { isSetupRunning, useSpeechSetupStore } from '../../stores/speechSetupStore'

function modelSize(id: string, t: (key: string) => string) {
  const bytes = MODEL_SIZE_BYTES[id]
  return bytes ? formatMegabytes(bytes) : t('speechSetup.unknownSize')
}

/**
 * The progress of a running setup: bar, "MB of MB · speed · time left", and Cancel while
 * downloading. Also the error line with Try again after a setup stopped. Renders nothing
 * when no setup ran.
 */
export function SpeechSetupProgress() {
  const { t } = useTranslation()
  const status = useSpeechSetupStore((s) => s.status)

  if (isSetupRunning(status)) {
    const percent = progressPercent(status)
    const downloading = status.phase === 'downloading'
    const details = downloading
      ? [
          t('speechSetup.ofTotal', {
            done: formatMegabytes(status.downloadedBytes),
            total: formatMegabytes(status.totalBytes),
          }),
          status.bytesPerSecond > 0 ? formatSpeed(status.bytesPerSecond) : null,
          formatTimeLeft(secondsLeft(status), t),
        ]
          .filter(Boolean)
          .join(' · ')
      : status.phase === 'verifying'
        ? t('speechSetup.verifying')
        : t('speechSetup.testing')
    return (
      <div className="space-y-1.5" data-testid="speech-setup-progress">
        <div className="flex items-center gap-2">
          <div
            role="progressbar"
            aria-label={t('speechSetup.progressLabel')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={downloading ? percent : 100}
            className="h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-bg-secondary"
          >
            <div
              className={`h-full rounded-full bg-accent transition-[width] duration-150 ${
                downloading ? '' : 'animate-pulse'
              }`}
              style={{ width: `${downloading ? percent : 100}%` }}
            />
          </div>
          <span className="w-[34px] flex-none text-right text-[11.5px] tabular-nums text-text-secondary">
            {downloading ? `${percent}%` : ''}
          </span>
          {downloading && (
            <button
              type="button"
              onClick={() => {
                cancelSpeechSetup().catch((error) =>
                  console.error('[speech setup] cancel failed', error),
                )
              }}
              className="btn-secondary flex-none"
            >
              {t('speechSetup.cancel')}
            </button>
          )}
        </div>
        <p className="m-0 flex items-center gap-1 text-[11.5px] text-text-secondary">
          {!downloading && <Loader2 size={11} className="animate-spin" />}
          {details}
        </p>
      </div>
    )
  }

  if (status.phase === 'error' && status.error) {
    const cancelled = status.error.code === 'cancelled'
    return (
      <div className="flex items-start gap-2" data-testid="speech-setup-error">
        <span
          className={`flex min-w-0 flex-1 items-start gap-1 text-[12px] ${
            cancelled ? 'text-text-secondary' : 'text-error'
          }`}
        >
          {!cancelled && <XCircle size={12} className="mt-[2px] flex-none" />}
          <span>{setupErrorMessage(status.error, t)}</span>
        </span>
        <button
          type="button"
          onClick={() => beginSpeechSetup(status.modelId ?? DEFAULT_SETUP_MODEL)}
          className="btn-accent flex-none"
        >
          {cancelled ? t('speechSetup.resume') : t('speechSetup.retry')}
        </button>
      </div>
    )
  }

  return null
}

/**
 * Plan 0012: "Quick setup (recommended)". One button downloads a Whisper model, runs it in
 * the app, and marks speech ready; a link picks the smaller model. The download runs in the
 * backend and continues when this card is not on screen.
 */
export function QuickSpeechSetup() {
  const { t } = useTranslation()
  const status = useSpeechSetupStatus()
  const running = isSetupRunning(status)
  const stopped = status.phase === 'error' && status.error !== null

  return (
    <div className="row-group" data-testid="quick-speech-setup">
      <div className="row flex-col items-stretch gap-2">
        <div className="flex items-start gap-2.5">
          <span className="mt-[1px] flex-none text-accent" aria-hidden="true">
            <Download size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-text-primary">
              {t('speechSetup.title')}
            </div>
            <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-text-secondary">
              {t('speechSetup.body', { size: modelSize(DEFAULT_SETUP_MODEL, t) })}
            </p>
          </div>
        </div>

        {status.phase === 'ready' ? (
          <p className="m-0 flex items-center gap-1 text-[12px] text-success">
            <CheckCircle2 size={12} />
            {t('speechSetup.ready')}
          </p>
        ) : running || stopped ? (
          <SpeechSetupProgress />
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => beginSpeechSetup(DEFAULT_SETUP_MODEL)}
              className="btn-accent"
            >
              {t('speechSetup.setUp')}
            </button>
            <button
              type="button"
              onClick={() => beginSpeechSetup(SMALL_SETUP_MODEL)}
              className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
            >
              {t('speechSetup.smaller', { size: modelSize(SMALL_SETUP_MODEL, t) })}
            </button>
          </div>
        )}
        {stopped && !running && (
          <button
            type="button"
            onClick={() => beginSpeechSetup(SMALL_SETUP_MODEL)}
            className="self-start cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
          >
            {t('speechSetup.smaller', { size: modelSize(SMALL_SETUP_MODEL, t) })}
          </button>
        )}
      </div>
    </div>
  )
}
