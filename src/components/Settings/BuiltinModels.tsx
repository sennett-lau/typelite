import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { deleteSpeechModel } from '../../lib/tauri'
import { formatMegabytes } from '../../lib/speechSetup'
import { isSetupRunning, useSpeechSetupStore } from '../../stores/speechSetupStore'
import { useAppStore } from '../../stores/appStore'
import { Group, Row } from '../ui/Group'

/**
 * Settings → Speech → Built-in models (plan 0012): the downloaded Whisper models with their
 * size and a Delete button (press twice to confirm). Hidden when none is installed.
 */
export function BuiltinModels() {
  const { t } = useTranslation()
  const models = useSpeechSetupStore((s) => s.models)
  const status = useSpeechSetupStore((s) => s.status)
  const refreshModels = useSpeechSetupStore((s) => s.refreshModels)
  const activeModelFile = useAppStore((s) => {
    const active = s.config.speech_presets.find(
      (preset) => preset.id === s.config.active_speech_preset_id,
    )
    return active?.kind === 'builtin' ? active.model_file : undefined
  })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const installed = (models ?? []).filter((model) => model.installed)
  if (installed.length === 0) return null

  const handleDelete = async (id: string) => {
    if (confirming !== id) {
      setConfirming(id)
      return
    }
    setConfirming(null)
    setError(null)
    try {
      await deleteSpeechModel(id)
    } catch (err) {
      setError(String(err))
    }
    await refreshModels()
  }

  return (
    <Group label={t('speechSetup.builtinModels')}>
      {installed.map((model) => {
        const busy = isSetupRunning(status) && status.modelId === model.id
        return (
          <Row
            key={model.id}
            testId={`builtin-model-${model.id}`}
            label={t(`speechSetup.modelNames.${model.id}`)}
            help={
              <>
                <span className="font-mono">{model.fileName}</span>
                {' · '}
                {formatMegabytes(model.sizeBytes)}
                {activeModelFile === model.fileName && ` · ${t('speechSetup.inUse')}`}
              </>
            }
          >
            <button
              type="button"
              onClick={() => void handleDelete(model.id)}
              onBlur={() => setConfirming((value) => (value === model.id ? null : value))}
              disabled={busy}
              aria-label={`${t('speechSetup.delete')}: ${t(`speechSetup.modelNames.${model.id}`)}`}
              className="btn-secondary"
            >
              <Trash2 size={13} />
              {confirming === model.id ? t('speechSetup.confirmDelete') : t('speechSetup.delete')}
            </button>
          </Row>
        )
      })}
      {error && (
        <Row>
          <span className="text-[12px] text-error">{error}</span>
        </Row>
      )}
    </Group>
  )
}
