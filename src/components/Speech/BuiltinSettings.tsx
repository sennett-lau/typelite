import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cancelSpeechSetup, deleteSpeechModel } from '../../lib/tauri'
import { defaultModelChoice, formatMegabytes, hardwareNote } from '../../lib/speechSetup'
import { builtinWhisperPreset, formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { isSetupRunning, useSpeechSetupStore } from '../../stores/speechSetupStore'
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
  runningSize,
  setupFailed,
} from './builtinText'

/**
 * Settings → Speech → Built-in details (plan 0015): the "Model" group with the option cards this
 * Mac is offered (hardware note at the top right), then one status row for the selected model:
 * Not downloaded + Download, Downloading + Cancel, In use + Delete, Download failed + Try again.
 */
export function BuiltinSettings() {
  const { t } = useTranslation()
  const status = useSpeechSetupStatus()
  const hardware = useSpeechHardware()
  const models = useSpeechSetupStore((s) => s.models)
  const refreshModels = useSpeechSetupStore((s) => s.refreshModels)
  const refreshHardware = useSpeechSetupStore((s) => s.refreshHardware)
  const builtin = useAppStore((s) => builtinWhisperPreset(s.config.speech_presets))
  const [choice, setChoice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const offered = hardware?.offer.models ?? []
  const inUseFile = builtin?.verified_at ? builtin.model_file : ''
  const current = builtin?.model_file ? builtin.model : null
  const selected = defaultModelChoice(hardware, choice ?? current)
  const info = (models ?? []).find((model) => model.id === selected)
  const running = isSetupRunning(status)

  const select = (id: string) => {
    setChoice(id)
    setConfirmDelete(false)
    setError(null)
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    setError(null)
    try {
      await deleteSpeechModel(selected)
    } catch (err) {
      setError(String(err))
    }
    await refreshModels()
    await refreshHardware()
  }

  const button = (label: string, onClick: () => void, accent = true) => (
    <button
      type="button"
      onClick={onClick}
      className={`${accent ? 'btn-accent' : 'btn-secondary'} px-3.5 py-1.5 text-[13px] font-medium`}
    >
      {label}
    </button>
  )

  let row: React.ReactNode
  if (running) {
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <span className="status-line">
            <span className="badge badge-neutral">{runningBadge(status, t)}</span>
            <span className="status-detail">{runningSize(status, t)}</span>
          </span>
          <ProgressTrack status={status} />
        </div>
        {status.phase === 'downloading' &&
          button(
            t('speechSetup.cancel'),
            () => {
              cancelSpeechSetup().catch((err) => console.error('[speech setup] cancel failed', err))
            },
            false,
          )}
      </>
    )
  } else if (setupFailed(status) && status.modelId === selected) {
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col">
          <span className="status-line">
            <span className="badge badge-error">{failedBadge(status, t)}</span>
            <span className="status-detail">{failedReason(status, t)}</span>
          </span>
        </div>
        {button(t('speechSetup.retry'), () => beginSpeechSetup(status.modelId ?? undefined))}
      </>
    )
  } else if (selected && info?.installed && info.fileName === inUseFile) {
    const tested =
      status.phase === 'ready' && status.modelId === selected && status.testMs
        ? t('speechSetup.testedIn', { time: formatTestTime(status.testMs) })
        : null
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col">
          <span className="status-line">
            <span className="badge">{t('speechSetup.badges.inUse')}</span>
            <span className="status-detail">
              {[modelDetail(selected, t, info.sizeBytes), tested].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleDelete()}
          onBlur={() => setConfirmDelete(false)}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {confirmDelete ? t('speechSetup.confirmDelete') : t('speechSetup.delete')}
        </button>
      </>
    )
  } else if (selected && info?.installed) {
    // Downloaded but not the model in use: one click tests it and switches to it.
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col">
          <span className="status-line">
            <span className="badge badge-neutral">{t('speechSetup.badges.downloaded')}</span>
            <span className="status-detail">{modelDetail(selected, t, info.sizeBytes)}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void handleDelete()}
          onBlur={() => setConfirmDelete(false)}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {confirmDelete ? t('speechSetup.confirmDelete') : t('speechSetup.delete')}
        </button>
        {button(t('speechSetup.use'), () => beginSpeechSetup(selected))}
      </>
    )
  } else if (selected) {
    const size = offered.find((model) => model.id === selected)?.sizeBytes
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col">
          <span className="status-line">
            <span className="badge badge-neutral">{t('speechSetup.badges.notDownloaded')}</span>
            <span className="status-detail">
              {modelName(selected, t)}
              {size ? ` · ${formatMegabytes(size)}` : ''}
            </span>
          </span>
        </div>
        {button(t('speechSetup.download'), () => beginSpeechSetup(selected))}
      </>
    )
  } else {
    row = (
      <span className="status-detail">
        {hardware ? hardwareNote(hardware, t, 'long') : t('speechSetup.checkingMac')}
      </span>
    )
  }

  return (
    <div data-testid="builtin-settings">
      <div className="mx-1 mt-5 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
        <span className="group-label m-0">{t('speechSetup.model')}</span>
        <span className="hardware-note">{hardwareNote(hardware, t, 'short')}</span>
      </div>
      {offered.length > 0 && (
        <div className="row-group px-3.5 py-3">
          <ModelOptions models={offered} selected={selected} onSelect={select} />
        </div>
      )}
      <div className="row-group mt-2.5">
        <div className="row" data-testid="builtin-status">
          {row}
        </div>
        {error && (
          <div className="row">
            <span className="text-[12px] text-error">{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
