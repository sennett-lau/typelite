import type { SpeechSetupStatus } from '../../lib/tauri'
import {
  MODEL_SIZE_BYTES,
  formatMegabytes,
  formatSpeed,
  formatTimeLeft,
  progressPercent,
  secondsLeft,
  setupErrorMessage,
} from '../../lib/speechSetup'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** "Best accuracy" or "Faster". */
export function modelName(id: string, t: Translate): string {
  return t(`speechSetup.models.${id}`)
}

/** "Whisper large-v3-turbo · 574 MB". */
export function modelDetail(id: string, t: Translate, sizeBytes?: number): string {
  const bytes = sizeBytes ?? MODEL_SIZE_BYTES[id]
  return t('speechSetup.modelDetail', { id, size: bytes ? formatMegabytes(bytes) : '' })
}

/** The badge of a running setup: "Downloading 42%", then "Checking the file", "Testing". */
export function runningBadge(status: SpeechSetupStatus, t: Translate): string {
  if (status.phase === 'verifying') return t('speechSetup.badges.checking')
  if (status.phase === 'testing') return t('speechSetup.badges.testing')
  return t('speechSetup.badges.downloading', { percent: progressPercent(status) })
}

/** "Best accuracy · 241 of 574 MB". */
export function runningSize(status: SpeechSetupStatus, t: Translate): string {
  const name = status.modelId ? modelName(status.modelId, t) : ''
  const size = t('speechSetup.ofTotal', {
    done: Math.round(status.downloadedBytes / 1_000_000),
    total: formatMegabytes(status.totalBytes),
  })
  return name ? `${name} · ${size}` : size
}

/** "12 MB/s · about 25 s left", or what happens after the download. */
export function runningEta(status: SpeechSetupStatus, t: Translate): string {
  if (status.phase === 'verifying') return t('speechSetup.verifying')
  if (status.phase === 'testing') return t('speechSetup.testing')
  return [
    status.bytesPerSecond > 0 ? formatSpeed(status.bytesPerSecond) : null,
    formatTimeLeft(secondsLeft(status), t),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Badge, detail and reason of a setup that stopped with an error (not a cancel). */
export function failedBadge(status: SpeechSetupStatus, t: Translate): string {
  return status.error?.code === 'load'
    ? t('speechSetup.badges.testFailed')
    : t('speechSetup.badges.failed')
}

export function failedReason(status: SpeechSetupStatus, t: Translate): string {
  return status.error ? setupErrorMessage(status.error, t) : ''
}

/** True when a setup stopped with an error the user should see (a cancel is not one). */
export function setupFailed(status: SpeechSetupStatus): boolean {
  return status.phase === 'error' && status.error !== null && status.error.code !== 'cancelled'
}
