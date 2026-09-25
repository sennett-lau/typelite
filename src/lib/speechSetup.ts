import type { SpeechHardwareCheck, SpeechSetupError, SpeechSetupStatus } from './tauri'

type Translate = (key: string | string[], values?: Record<string, unknown>) => string

/**
 * The i18n namespace of a built-in model setup: `speechSetup` (plan `quick-speech-setup`) or
 * `aiSetup` (plan `ai-polish-setup`). AI texts fall back to the speech ones where the wording is
 * the same.
 */
export type SetupTextNamespace = 'speechSetup' | 'aiSetup'

/** The i18n key (or keys, most specific first) of `key` in `ns`. */
export function setupKey(ns: SetupTextNamespace, key: string): string | string[] {
  return ns === 'speechSetup' ? `speechSetup.${key}` : [`${ns}.${key}`, `speechSetup.${key}`]
}

/** The larger model ("Best accuracy") and the smaller one ("Faster"). */
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

/** A file size as Finder shows it: "574 MB", or "2.5 GB" from one gigabyte up. */
export function formatSize(bytes: number): string {
  return bytes >= 1_000_000_000 ? `${formatGigabytes(bytes)} GB` : formatMegabytes(bytes)
}

/** The "done" part of "241 of 574 MB" or "1.0 of 2.5 GB", in the unit of the total. */
export function formatDone(done: number, total: number): string {
  return total >= 1_000_000_000 ? formatGigabytes(done) : String(Math.round(done / 1_000_000))
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

/** The messages of behaviour.md (plan `quick-speech-setup`) for each way a setup can stop. */
export function setupErrorMessage(
  error: SpeechSetupError,
  t: Translate,
  ns: SetupTextNamespace = 'speechSetup',
): string {
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
    case 'server_missing':
      return t('aiSetup.errors.serverMissing')
    case 'load': {
      if (ns === 'aiSetup') return t('aiSetup.errors.load', { reason: error.reason })
      // The backend words it "Could not load the speech model: <reason>. Try the smaller
      // model."; show only the reason inside the translated sentence.
      const match = /^Could not load the speech model: (.*)\. Try the smaller model\.$/s.exec(
        error.reason,
      )
      return t('speechSetup.errors.load', { reason: match ? match[1] : error.reason })
    }
  }
}

/** Installed memory as macOS reports it: "32" (GB, binary). */
export function memoryGigabytes(bytes: number): number {
  return Math.round(bytes / 1024 ** 3)
}

/**
 * Plan `two-tab-speech`: the model the option cards select when the user has not picked one: the
 * given one if it is offered, otherwise the first (recommended) offered model.
 */
export function defaultModelChoice(
  check: SpeechHardwareCheck | null,
  preferred?: string | null,
): string | null {
  const offered = check?.offer.models ?? []
  if (preferred && offered.some((model) => model.id === preferred)) return preferred
  return offered[0]?.id ?? null
}

/**
 * Plan `ai-polish-setup`: true when the check came back and no built-in model can run here (none
 * suits the Mac, or the AI server program is missing). The screens then hide the model cards'
 * status row and download buttons, and the Built-in option cannot be picked.
 */
export function noModelSuits(check: SpeechHardwareCheck | null): boolean {
  return check !== null && (check.offer.models.length === 0 || check.serverAvailable === false)
}

/**
 * The hardware note (plan `two-tab-speech`). `long` for onboarding: "This Mac: Apple M1 Pro, 32 GB
 * memory." plus why the larger model is left out; `short` for the Settings group header:
 * "Apple M1 Pro · 32 GB". With no model that fits, says how much space is needed (or, for AI,
 * that this Mac cannot run one).
 */
export function hardwareNote(
  check: SpeechHardwareCheck | null,
  t: Translate,
  style: 'long' | 'short',
  ns: SetupTextNamespace = 'speechSetup',
): string {
  if (!check) return ''
  const { hardware, offer } = check
  if (check.serverAvailable === false) return t('aiSetup.hardware.serverMissing')
  if (offer.models.length === 0 && offer.neededBytes !== null) {
    return t('speechSetup.hardware.noSpace', {
      needed: formatGigabytes(offer.neededBytes),
      available: formatGigabytes(hardware.freeBytes),
    })
  }
  if (offer.models.length === 0 && ns === 'aiSetup') return t('aiSetup.hardware.none')
  const chip = hardware.chipName || t('speechSetup.hardware.unknownChip')
  const memory = memoryGigabytes(hardware.memoryBytes)
  const reason = offer.leftOut ? t(setupKey(ns, `hardware.leftOut.${offer.leftOut}`)) : ''
  if (style === 'short') {
    const base = t('speechSetup.hardware.short', { chip, memory })
    return reason ? `${base} · ${reason}` : base
  }
  const base = t('speechSetup.hardware.long', { chip, memory })
  return reason ? `${base} ${reason}` : base
}
