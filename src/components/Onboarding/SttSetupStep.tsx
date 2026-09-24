import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUILTIN_SPEECH_PRESET, findActivePreset, useAppStore } from '../../stores/appStore'
import { testSpeechPreset } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { Field, PresetSummary, TestStatusHint } from './presetStepParts'
import { Loader2 } from 'lucide-react'
import { Row } from '../ui/Group'
import { recordSpeechResult } from '../../lib/connectionStatus'

/**
 * Onboarding step: pick a speech preset (the built-in local whisper.cpp one is preselected),
 * optionally enter an API key, and run Test. Continue stays disabled until Test passes.
 */
export function SttSetupStep() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const setSttTestStatus = useAppStore((s) => s.setSttTestStatus)
  const sttLatencyMs = useAppStore((s) => s.sttLatencyMs)
  const setSttLatencyMs = useAppStore((s) => s.setSttLatencyMs)

  const presets = config.speech_presets?.length ? config.speech_presets : [BUILTIN_SPEECH_PRESET]
  const active = findActivePreset(presets, config.active_speech_preset_id) ?? presets[0]
  const { apiKey, setApiKey, saveNow } = usePresetApiKey('stt', active.id)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resetTest = () => {
    setSttTestStatus('idle')
    setSttLatencyMs(null)
    setErrorMessage(null)
  }

  const handleTest = async () => {
    setSttTestStatus('testing')
    setSttLatencyMs(null)
    setErrorMessage(null)
    try {
      const ms = await testSpeechPreset(active, apiKey)
      setSttLatencyMs(ms)
      setSttTestStatus('success')
      recordSpeechResult(true)
    } catch (error) {
      console.error('[onboarding] speech preset test failed', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setSttTestStatus('error')
      recordSpeechResult(false)
    }
  }

  return (
    <div className="row-group">
      <Row label={t('onboarding.stt.serviceLabel')}>
        <select
          aria-label={t('onboarding.stt.serviceLabel')}
          value={active.id}
          onChange={(e) => {
            updateConfig({ active_speech_preset_id: e.target.value })
            resetTest()
          }}
          className="popup max-w-[220px]"
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </Row>
      <PresetSummary baseUrl={active.base_url} model={active.model} />

      <Field label={t('presets.apiKeyOptional')}>
        <div className="flex gap-2">
          <input
            type="password"
            aria-label={t('presets.apiKeyOptional')}
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              resetTest()
            }}
            onBlur={saveNow}
            placeholder={t('presets.apiKeyPlaceholder')}
            className="field min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={sttTestStatus === 'testing' || !active.base_url.trim()}
            className="btn-accent"
          >
            {sttTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('onboarding.stt.testButton')}
          </button>
        </div>
        <TestStatusHint
          status={sttTestStatus}
          latencyMs={sttLatencyMs}
          errorMessage={errorMessage}
          okKey="onboarding.stt.connectionOk"
          failKey="onboarding.stt.connectionFail"
        />
      </Field>
    </div>
  )
}
