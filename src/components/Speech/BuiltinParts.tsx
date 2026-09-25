import { useTranslation } from 'react-i18next'
import type { OfferedModel, SpeechSetupStatus } from '../../lib/tauri'
import { progressPercent, setupKey } from '../../lib/speechSetup'
import { modelDetail, modelName } from './builtinText'
import { SPEECH_SERVICE, type EngineService } from './services'

/**
 * Plan `two-tab-speech`: the models this Mac runs well, as radio option cards. With one model there
 * is nothing to choose, but it still shows as selected.
 */
export function ModelOptions({
  models,
  selected,
  onSelect,
  service = SPEECH_SERVICE,
}: {
  models: OfferedModel[]
  selected: string | null
  onSelect: (id: string) => void
  service?: EngineService
}) {
  const { t } = useTranslation()
  const one = models.length === 1
  return (
    <div
      role="radiogroup"
      aria-label={t('speechSetup.model')}
      className={`option-cards ${one ? 'option-cards-one' : ''}`}
    >
      {models.map((model) => (
        <button
          key={model.id}
          type="button"
          role="radio"
          aria-checked={model.id === selected}
          onClick={() => {
            if (!one) onSelect(model.id)
          }}
          className="option-card"
        >
          <span className="option-card-title">
            {modelName(model.id, t, service)}
            {model.recommended && <span className="tag">{t('speechSetup.recommended')}</span>}
          </span>
          <span className="option-card-detail">
            {modelDetail(model.id, t, model.sizeBytes, service)}
          </span>
        </button>
      ))}
    </div>
  )
}

/** The progress bar of a running setup. */
export function ProgressTrack({
  status,
  service = SPEECH_SERVICE,
}: {
  status: SpeechSetupStatus
  service?: EngineService
}) {
  const { t } = useTranslation()
  const downloading = status.phase === 'downloading'
  const percent = downloading ? progressPercent(status) : 100
  return (
    <div
      role="progressbar"
      aria-label={t(setupKey(service.ns, 'progressLabel'))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="progress-track"
    >
      <div className={downloading ? '' : 'animate-pulse'} style={{ width: `${percent}%` }} />
    </div>
  )
}
