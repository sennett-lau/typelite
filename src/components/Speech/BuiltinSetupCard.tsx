import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cpu } from 'lucide-react'
import { cancelSpeechSetup } from '../../lib/tauri'
import { defaultModelChoice, hardwareNote } from '../../lib/speechSetup'
import { builtinWhisperPreset, formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { isSetupRunning } from '../../stores/speechSetupStore'
import {
  beginSpeechSetup,
  useSpeechHardware,
  useSpeechSetupStatus,
} from '../../hooks/useSpeechSetup'
import { ModelOptions, ProgressTrack } from './BuiltinParts'
import {
  failedBadge,
  failedReason,
  modelDetail,
  modelName,
  runningBadge,
  runningEta,
  runningSize,
  setupFailed,
} from './builtinText'

type CardState = 'none' | 'downloading' | 'ready' | 'failed'

/**
 * Onboarding → Speech recognition, the Built-in card (plan `two-tab-speech`). It has one fixed
 * height; every state fills the same two slots, a status area and one action button at the bottom
 * right: Not set up (model cards + hardware note, Set up), Downloading (Cancel), Ready (Change
 * model), Failed (Try again).
 */
export function BuiltinSetupCard() {
  const { t } = useTranslation()
  const status = useSpeechSetupStatus()
  const hardware = useSpeechHardware()
  const builtin = useAppStore((s) => builtinWhisperPreset(s.config.speech_presets))
  const [choice, setChoice] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const ready = Boolean(builtin?.model_file && builtin.verified_at)
  const state: CardState = isSetupRunning(status)
    ? 'downloading'
    : setupFailed(status)
      ? 'failed'
      : ready && !changing
        ? 'ready'
        : 'none'

  const selected = defaultModelChoice(hardware, choice ?? (ready ? builtin?.model : null))
  const offered = hardware?.offer.models ?? []
  const noModelFits = hardware !== null && offered.length === 0

  const start = (modelId: string | null) => {
    setChanging(false)
    beginSpeechSetup(modelId ?? undefined)
  }

  const readyModel = builtin?.model ?? ''
  const testTime =
    status.phase === 'ready' && status.modelId === readyModel && status.testMs
      ? t('speechSetup.testedOnThisMac', { time: formatTestTime(status.testMs) })
      : null

  return (
    <div className="setup-card" aria-live="polite" data-testid="builtin-setup-card">
      <div className="flex items-start gap-3">
        <div className="setup-card-icon" aria-hidden="true">
          <Cpu size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="m-0 flex flex-wrap items-center gap-2 text-[14px] font-semibold text-text-primary">
            {t('speechSetup.builtinTitle')}
            <span className="tag">{t('speechSetup.recommended')}</span>
          </h3>
          <p className="m-0 mt-[3px] text-[12.5px] leading-[1.45] text-text-secondary">
            {t('speechSetup.builtinBody')}
          </p>
        </div>
      </div>

      <div className="setup-card-body">
        {state === 'none' && (
          <>
            {offered.length > 0 && (
              <ModelOptions models={offered} selected={selected} onSelect={setChoice} />
            )}
            <span className="hardware-note">
              {hardware ? hardwareNote(hardware, t, 'long') : t('speechSetup.checkingMac')}
            </span>
          </>
        )}
        {state === 'downloading' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge badge-neutral">{runningBadge(status, t)}</span>
              <span className="status-detail">{runningSize(status, t)}</span>
            </div>
            <ProgressTrack status={status} />
            <span className="status-detail">{runningEta(status, t)}</span>
          </div>
        )}
        {state === 'ready' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge">{t('speechSetup.badges.ready')}</span>
              <span className="status-detail">{modelName(readyModel, t)}</span>
            </div>
            <span className="status-detail">
              {[modelDetail(readyModel, t), testTime].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}
        {state === 'failed' && (
          <div className="flex flex-col gap-2">
            <div className="status-line">
              <span className="badge badge-error">{failedBadge(status, t)}</span>
              {status.error?.code !== 'load' && (
                <span className="status-detail">{t('speechSetup.nothingInstalled')}</span>
              )}
            </div>
            <span className="status-detail">{failedReason(status, t)}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state === 'none' && (
          <button
            type="button"
            onClick={() => start(selected)}
            disabled={noModelFits}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('speechSetup.setUp')}
          </button>
        )}
        {state === 'downloading' && (
          <button
            type="button"
            onClick={() => {
              cancelSpeechSetup().catch((error) =>
                console.error('[speech setup] cancel failed', error),
              )
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
