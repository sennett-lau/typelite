import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cpu, Sparkles } from 'lucide-react'
import { defaultModelChoice, hardwareNote, noModelSuits, setupKey } from '../../lib/speechSetup'
import { formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { isSetupRunning } from '../../stores/modelSetupStore'
import { useSetupHardware, useSetupStatus } from '../../hooks/useSpeechSetup'
import { ModelOptions, ProgressTrack } from './BuiltinParts'
import {
  downloadFailed,
  failedBadge,
  failedReason,
  modelDetail,
  modelName,
  runningBadge,
  runningEta,
  runningSize,
  setupFailed,
} from './builtinText'
import { SPEECH_SERVICE, builtinPresetOf, type EngineService } from './services'

type CardState = 'none' | 'downloading' | 'ready' | 'failed'

/**
 * Onboarding → Speech recognition and → AI polish, the Built-in card (plans 0015 and 0017). It
 * has one fixed height; every state fills the same two slots, a status area and one action
 * button at the bottom right: Not set up (model cards + hardware note, Set up), Downloading
 * (Cancel), Ready (Change model), Failed (Try again). When no model suits this Mac there are
 * no cards and no button, only the note.
 */
export function BuiltinSetupCard({ service = SPEECH_SERVICE }: { service?: EngineService }) {
  const { t } = useTranslation()
  const status = useSetupStatus(service.store)
  const hardware = useSetupHardware(service.store)
  const builtin = useAppStore((s) => builtinPresetOf(service, s.config))
  const [choice, setChoice] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const ready = Boolean(builtin?.model_file && builtin.verified_at)
  const noModel = noModelSuits(hardware)
  const state: CardState = isSetupRunning(status)
    ? 'downloading'
    : setupFailed(status) && !noModel
      ? 'failed'
      : ready && !changing
        ? 'ready'
        : 'none'

  const selected = defaultModelChoice(hardware, choice ?? (ready ? builtin?.model : null))
  const offered = noModel ? [] : (hardware?.offer.models ?? [])

  const start = (modelId: string | null) => {
    setChanging(false)
    service.start(modelId)
  }

  const readyModel = builtin?.model ?? ''
  const testTime =
    status.phase === 'ready' && status.modelId === readyModel && status.testMs
      ? t('speechSetup.testedOnThisMac', { time: formatTestTime(status.testMs) })
      : null
  const Icon = service.id === 'ai' ? Sparkles : Cpu

  return (
    <div className="setup-card" aria-live="polite" data-testid="builtin-setup-card">
      <div className="flex items-start gap-3">
        <div className="setup-card-icon" aria-hidden="true">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text-primary">
            {t('speechSetup.builtinTitle')}
            {!noModel && <span className="tag">{t('speechSetup.recommended')}</span>}
          </h3>
          <p className="m-0 mt-[3px] text-[12.5px] leading-[1.45] text-text-secondary">
            {t(setupKey(service.ns, 'builtinBody'))}
          </p>
        </div>
      </div>

      <div className="setup-card-body">
        {state === 'none' && (
          <>
            {offered.length > 0 && (
              <ModelOptions
                models={offered}
                selected={selected}
                onSelect={setChoice}
                service={service}
              />
            )}
            <span className="hardware-note">
              {hardware
                ? hardwareNote(hardware, t, 'long', service.ns)
                : t('speechSetup.checkingMac')}
            </span>
          </>
        )}
        {state === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge badge-neutral">{runningBadge(status, t)}</span>
              <span className="status-detail">{runningSize(status, t, service)}</span>
            </div>
            <ProgressTrack status={status} service={service} />
            <span className="status-detail">{runningEta(status, t, service)}</span>
          </div>
        )}
        {state === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge">{t('speechSetup.badges.ready')}</span>
              <span className="status-detail">{modelName(readyModel, t, service)}</span>
            </div>
            <span className="status-detail">
              {[modelDetail(readyModel, t, undefined, service), testTime]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
        {state === 'failed' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge badge-error">{failedBadge(status, t)}</span>
              {downloadFailed(status) && (
                <span className="status-detail">{t('speechSetup.nothingInstalled')}</span>
              )}
            </div>
            <span className="status-detail">{failedReason(status, t, service)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state === 'none' && !noModel && (
          <button
            type="button"
            onClick={() => start(selected)}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('speechSetup.setUp')}
          </button>
        )}
        {state === 'downloading' && (
          <button
            type="button"
            onClick={() => {
              service
                .cancel()
                .catch((error) => console.error(`[${service.id} setup] cancel failed`, error))
            }}
            disabled={status.phase !== 'downloading'}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('speechSetup.cancel')}
          </button>
        )}
        {state === 'ready' && (
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('speechSetup.changeModel')}
          </button>
        )}
        {state === 'failed' && (
          <button
            type="button"
            onClick={() => start(status.modelId ?? selected)}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('speechSetup.retry')}
          </button>
        )}
      </div>
    </div>
  )
}
