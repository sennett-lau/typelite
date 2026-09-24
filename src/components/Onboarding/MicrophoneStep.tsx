import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { MicrophonePicker } from '../Settings/MicrophonePicker'
import { persistConfig } from './persistConfig'

/**
 * Step 2: choose the input device. "System default" counts as a choice, so this step never
 * blocks. The choice is saved at once so the shortcut practice in steps 5–7 records from it.
 */
export function MicrophoneStep() {
  const { t } = useTranslation()
  const inputDevice = useAppStore((s) => s.config.input_device)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (value: string) => {
    updateConfig({ input_device: value })
    setError(null)
    persistConfig().catch((saveError) => setError(String(saveError)))
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        {t('onboarding.microphone.intro')}
      </p>
      <div className="row-group">
        <MicrophonePicker value={inputDevice ?? ''} onChange={handleChange} />
      </div>
      {error && <p className="text-[12px] text-error">{t('onboarding.saveFailed', { error })}</p>}
    </div>
  )
}
