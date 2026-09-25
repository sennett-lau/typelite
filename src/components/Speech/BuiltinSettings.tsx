import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultModelChoice, formatSize, hardwareNote, noModelSuits } from '../../lib/speechSetup'
import { formatTestTime } from '../../lib/speechTypes'
import { useAppStore } from '../../stores/appStore'
import { isSetupRunning } from '../../stores/modelSetupStore'
import { useSetupHardware, useSetupStatus } from '../../hooks/useSpeechSetup'
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
import { SPEECH_SERVICE, builtinPresetOf, type EngineService } from './services'

/**
 * Settings → Speech / AI → Built-in details (plans 0015 and 0017): the "Model" group with the
 * option cards this Mac is offered (hardware note at the top right), then one status row for
 * the selected model: Not downloaded + Download, Downloading + Cancel, In use + Delete,
 * Download failed + Try again. When no model suits this Mac, the cards and the status row are
 * hidden and only the note shows.
 */
export function BuiltinSettings({ service = SPEECH_SERVICE }: { service?: EngineService }) {
  const { t } = useTranslation()
  const status = useSetupStatus(service.store)
  const hardware = useSetupHardware(service.store)
  const models = service.store((s) => s.models)
  const refreshModels = service.store((s) => s.refreshModels)
  const refreshHardware = service.store((s) => s.refreshHardware)
  const builtin = useAppStore((s) => builtinPresetOf(service, s.config))
  const [choice, setChoice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const noModel = noModelSuits(hardware)
  const offered = noModel ? [] : (hardware?.offer.models ?? [])
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
      await service.deleteModel(selected)
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

  const deleteButton = (
    <button
      type="button"
      onClick={() => void handleDelete()}
      onBlur={() => setConfirmDelete(false)}
      className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
    >
      {confirmDelete ? t('speechSetup.confirmDelete') : t('speechSetup.delete')}
    </button>
  )

  let row: React.ReactNode = null
  if (running) {
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
          <span className="status-line">
            <span className="badge badge-neutral">{runningBadge(status, t)}</span>
            <span className="status-detail">{runningSize(status, t, service)}</span>
          </span>
          <ProgressTrack status={status} service={service} />
        </div>
        {status.phase === 'downloading' &&
          button(
            t('speechSetup.cancel'),
            () => {
              service
                .cancel()
                .catch((err) => console.error(`[${service.id} setup] cancel failed`, err))
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
            <span className="status-detail">{failedReason(status, t, service)}</span>
          </span>
        </div>
        {button(t('speechSetup.retry'), () => service.start(status.modelId ?? null))}
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
              {[modelDetail(selected, t, info.sizeBytes, service), tested]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </div>
        {deleteButton}
      </>
    )
  } else if (selected && info?.installed) {
    // Downloaded but not the model in use: one click tests it and switches to it.
    row = (
      <>
        <div className="flex min-w-[140px] flex-1 flex-col">
          <span className="status-line">
            <span className="badge badge-neutral">{t('speechSetup.badges.downloaded')}</span>
            <span className="status-detail">
              {modelDetail(selected, t, info.sizeBytes, service)}
            </span>
          </span>
        </div>
        {deleteButton}
        {button(t('speechSetup.use'), () => service.start(selected))}
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
              {modelName(selected, t, service)}
              {size ? ` · ${formatSize(size)}` : ''}
            </span>
          </span>
        </div>
        {button(t('speechSetup.download'), () => service.start(selected))}
      </>
    )
  } else if (!hardware) {
    row = <span className="status-detail">{t('speechSetup.checkingMac')}</span>
  }

  return (
    <div data-testid="builtin-settings">
      <div className="mx-1 mt-5 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
        <span className="group-label m-0">{t('speechSetup.model')}</span>
        {!noModel && (
          <span className="hardware-note">{hardwareNote(hardware, t, 'short', service.ns)}</span>
        )}
      </div>
      {noModel ? (
        <div className="row-group px-3.5 py-3">
          <span className="status-detail" data-testid="builtin-no-model">
            {hardwareNote(hardware, t, 'long', service.ns)}
          </span>
        </div>
      ) : (
        <>
          {offered.length > 0 && (
            <div className="row-group px-3.5 py-3">
              <ModelOptions
                models={offered}
                selected={selected}
                onSelect={select}
                service={service}
              />
            </div>
          )}
          {row && (
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
          )}
        </>
      )}
    </div>
  )
}
