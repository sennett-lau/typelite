import type { SpeechSetupError, SpeechSetupStatus } from './tauri'

type Translate = (key: string, values?: Record<string, unknown>) => string

/** The model Quick setup downloads by default, and the smaller choice. */
export const DEFAULT_SETUP_MODEL = 'large-v3-turbo'
export const SMALL_SETUP_MODEL = 'small'

/** Sizes shown before the model list has loaded (match `KNOWN_MODELS` in the backend). */
export const MODEL_SIZE_BYTES: Record<string, number> = {
  [DEFAULT_SETUP_MODEL]: 574_041_195,
  [SMALL_SETUP_MODEL]: 190_085_487,
}

/** Decimal megabytes, as Finder shows file sizes: "574 MB". */
export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

export function formatGigabytes(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(1)
}

export function formatSpeed(bytesPerSecond: number): string {
  const mb = bytesPerSecond / 1_000_000
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB/s`
}

/** Seconds left at the current speed, or null when it cannot be told yet. */
export function secondsLeft(status: SpeechSetupStatus): number | null {
  if (status.bytesPerSecond <= 0 || status.totalBytes <= 0) return null
  const remaining = Math.max(0, status.totalBytes - status.downloadedBytes)
  return Math.ceil(remaining / status.bytesPerSecond)
}

export function formatTimeLeft(seconds: number | null, t: Translate): string | null {
  if (seconds === null) return null
  if (seconds < 60) return t('speechSetup.secondsLeft', { count: Math.max(1, seconds) })
  return t('speechSetup.minutesLeft', { count: Math.round(seconds / 60) })
}

export function progressPercent(status: SpeechSetupStatus): number {
  if (status.totalBytes <= 0) return 0
  return Math.min(100, Math.floor((status.downloadedBytes / status.totalBytes) * 100))
}

/** The messages of behaviour.md (plan 0012) for each way a setup can stop. */
export function setupErrorMessage(error: SpeechSetupError, t: Translate): string {
  switch (error.code) {
    case 'network':
      return t('speechSetup.errors.network', { reason: error.reason })
    case 'disk_space':
      return t('speechSetup.errors.diskSpace', {
        needed: formatGigabytes(error.neededBytes),
        available: formatGigabytes(error.availableBytes),
      })
    case 'checksum':
      return t('speechSetup.errors.checksum')
    case 'cancelled':
      return t('speechSetup.errors.cancelled')
    case 'io':
      return t('speechSetup.errors.io', { reason: error.reason })
    case 'load': {
      // The backend words it "Could not load the speech model: <reason>. Try the smaller
      // model."; show only the reason inside the translated sentence.
      const match = /^Could not load the speech model: (.*)\. Try the smaller model\.$/s.exec(
        error.reason,
      )
      return t('speechSetup.errors.load', { reason: match ? match[1] : error.reason })
    }
  }
}
