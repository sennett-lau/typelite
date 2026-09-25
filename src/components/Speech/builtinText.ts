import type { SpeechSetupStatus } from '../../lib/tauri'
import {
  formatDone,
  formatSize,
  formatSpeed,
  formatTimeLeft,
  progressPercent,
  secondsLeft,
  setupErrorMessage,
  setupKey,
} from '../../lib/speechSetup'
import { SPEECH_SERVICE, type EngineService } from './services'

type Translate = (key: string | string[], values?: Record<string, unknown>) => string

/** "Best accuracy" / "Best quality", or "Faster". */
export function modelName(id: string, t: Translate, service: EngineService = SPEECH_SERVICE) {
  return t(`${service.ns}.models.${service.modelKey(id)}`)
}

/** "Whisper large-v3-turbo · 574 MB" or "Qwen3 4B Instruct · 2.5 GB". */
export function modelDetail(
  id: string,
  t: Translate,
  sizeBytes?: number,
  service: EngineService = SPEECH_SERVICE,
): string {
  const bytes = sizeBytes ?? service.sizes[id]
  const size = bytes ? formatSize(bytes) : ''
  if (service.ns === 'speechSetup') return t('speechSetup.modelDetail', { id, size })
  return t(`${service.ns}.modelDetail.${service.modelKey(id)}`, { size })
}

/** The badge of a running setup: "Downloading 42%", then "Checking the file", "Testing". */
export function runningBadge(status: SpeechSetupStatus, t: Translate): string {
  if (status.phase === 'verifying') return t('speechSetup.badges.checking')
  if (status.phase === 'testing') return t('speechSetup.badges.testing')
  return t('speechSetup.badges.downloading', { percent: progressPercent(status) })
}

/** "Best accuracy · 241 of 574 MB" or "Best quality · 1.0 of 2.5 GB". */
export function runningSize(
  status: SpeechSetupStatus,
  t: Translate,
  service: EngineService = SPEECH_SERVICE,
): string {
  const name = status.modelId ? modelName(status.modelId, t, service) : ''
  const size = t('speechSetup.ofTotal', {
    done: formatDone(status.downloadedBytes, status.totalBytes),
    total: formatSize(status.totalBytes),
  })
  return name ? `${name} · ${size}` : size
}

/** "12 MB/s · about 25 s left", or what happens after the download. */
export function runningEta(
  status: SpeechSetupStatus,
  t: Translate,
  service: EngineService = SPEECH_SERVICE,
): string {
  if (status.phase === 'verifying') return t('speechSetup.verifying')
  if (status.phase === 'testing') return t(setupKey(service.ns, 'testing'))
  return [
    status.bytesPerSecond > 0 ? formatSpeed(status.bytesPerSecond) : null,
    formatTimeLeft(secondsLeft(status), t),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Badge, detail and reason of a setup that stopped with an error (not a cancel). */
export function failedBadge(status: SpeechSetupStatus, t: Translate): string {
  return status.error?.code === 'load' || status.error?.code === 'server_missing'
    ? t('speechSetup.badges.testFailed')
    : t('speechSetup.badges.failed')
}

export function failedReason(
  status: SpeechSetupStatus,
  t: Translate,
  service: EngineService = SPEECH_SERVICE,
): string {
  return status.error ? setupErrorMessage(status.error, t, service.ns) : ''
}

/** True when the download itself went wrong (so "Nothing was installed" is true). */
export function downloadFailed(status: SpeechSetupStatus): boolean {
  return status.error?.code !== 'load' && status.error?.code !== 'server_missing'
}

/** True when a setup stopped with an error the user should see (a cancel is not one). */
export function setupFailed(status: SpeechSetupStatus): boolean {
  return status.phase === 'error' && status.error !== null && status.error.code !== 'cancelled'
}
