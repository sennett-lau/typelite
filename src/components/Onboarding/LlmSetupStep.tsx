import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUILTIN_AI_PRESET, findActivePreset, useAppStore } from '../../stores/appStore'
import { testAiPreset } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { Field, PresetSummary, TestStatusHint } from './presetStepParts'
import { Loader2 } from 'lucide-react'
import { Row } from '../ui/Group'
import { recordAiResult } from '../../lib/connectionStatus'

/**
 * Onboarding step: pick an AI preset (the built-in PC Ollama one is preselected),
 * optionally enter an API key, and run Test. Continue stays disabled until Test passes.
 */
export function LlmSetupStep() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const llmTestStatus = useAppStore((s) => s.llmTestStatus)
  const setLlmTestStatus = useAppStore((s) => s.setLlmTestStatus)
  const llmLatencyMs = useAppStore((s) => s.llmLatencyMs)
  const setLlmLatencyMs = useAppStore((s) => s.setLlmLatencyMs)

  const presets = config.ai_presets?.length ? config.ai_presets : [BUILTIN_AI_PRESET]
  const active = findActivePreset(presets, config.active_ai_preset_id) ?? presets[0]
  const { apiKey, setApiKey, saveNow } = usePresetApiKey('llm', active.id)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const resetTest = () => {
    setLlmTestStatus('idle')
    setLlmLatencyMs(null)
    setErrorMessage(null)
  }

  const handleTest = async () => {
    setLlmTestStatus('testing')
    setLlmLatencyMs(null)
    setErrorMessage(null)
    try {
      const ms = await testAiPreset(active, apiKey)
      setLlmLatencyMs(ms)
      setLlmTestStatus('success')
      recordAiResult(true)
    } catch (error) {
      console.error('[onboarding] AI preset test failed', error)
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setLlmTestStatus('error')
      recordAiResult(false)
    }
  }

  return (
    <div className="row-group">
      <Row label={t('onboarding.llm.serviceLabel')}>
        <select
          aria-label={t('onboarding.llm.serviceLabel')}
          value={active.id}
          onChange={(e) => {
            updateConfig({ active_ai_preset_id: e.target.value })
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
            disabled={llmTestStatus === 'testing' || !active.base_url.trim()}
            className="btn-accent"
          >
            {llmTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('onboarding.llm.testButton')}
          </button>
        </div>
        <TestStatusHint
          status={llmTestStatus}
          latencyMs={llmLatencyMs}
          errorMessage={errorMessage}
          okKey="onboarding.llm.connectionOk"
          failKey="onboarding.llm.connectionFail"
        />
      </Field>
    </div>
  )
}
