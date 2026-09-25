import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, RefreshCw } from 'lucide-react'
import {
  BUILTIN_AI_PRESET,
  findActivePreset,
  useAppStore,
  type AiPreset,
} from '../../stores/appStore'
import { fetchAiModels, setCredential, testAiPreset } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { parseExtraFields } from '../../lib/extraFields'
import { recordAiResult } from '../../lib/connectionStatus'
import { hasPlaceholder, recordTestPassed } from '../../lib/readiness'
import { Group, Row } from '../ui/Group'
import { PresetPicker } from './PresetPicker'
import { TestFeedback } from './SpeechPresetEditor'

/** Text fields hold technical values (URLs, model names, JSON), so they use SF Mono. */
const inputClass = 'field w-full min-w-0 font-mono text-[12px]'

/** Shows extra request fields as editable JSON; an empty object shows as an empty box. */
function formatExtraFields(fields: Record<string, unknown>): string {
  return Object.keys(fields).length === 0 ? '' : JSON.stringify(fields, null, 2)
}

/**
 * The AI preset editor: preset picker (rename, save as new, delete), base URL, model (with the
 * server's model list), extra request fields, optional API key and Test. Used by Settings → AI
 * and by the onboarding AI step, so both always work the same way.
 */
export function AiPresetEditor() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const llmTestStatus = useAppStore((s) => s.llmTestStatus)
  const setLlmTestStatus = useAppStore((s) => s.setLlmTestStatus)
  const llmLatencyMs = useAppStore((s) => s.llmLatencyMs)
  const setLlmLatencyMs = useAppStore((s) => s.setLlmLatencyMs)
  const models = useAppStore((s) => s.llmModels)
  const setModels = useAppStore((s) => s.setLlmModels)

  const [fetchingModels, setFetchingModels] = useState(false)
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presets = config.ai_presets?.length ? config.ai_presets : [BUILTIN_AI_PRESET]
  const active = findActivePreset(presets, config.active_ai_preset_id) ?? presets[0]
  const {
    apiKey: llmApiKey,
    setApiKey: setLlmApiKey,
    saveNow: saveLlmApiKeyNow,
    saveError: credentialErrorMessage,
  } = usePresetApiKey('llm', active.id)
  const extraFieldsJson = JSON.stringify(active.extra_request_fields ?? {})
  const [extraFieldsDraft, setExtraFieldsDraft] = useState(() =>
    formatExtraFields(active.extra_request_fields ?? {}),
  )
  const [extraFieldsInvalid, setExtraFieldsInvalid] = useState(false)

  // Show the saved extra fields again when another preset is picked or the config is reset,
  // but keep the user's own formatting while it still means the same object.
  useEffect(() => {
    const saved = JSON.parse(extraFieldsJson) as Record<string, unknown>
    setExtraFieldsDraft((draft) => {
      const parsed = parseExtraFields(draft)
      if (parsed && JSON.stringify(parsed) === extraFieldsJson) return draft
      return formatExtraFields(saved)
    })
    setExtraFieldsInvalid(false)
  }, [active.id, extraFieldsJson])

  const resetTest = () => {
    setLlmTestStatus('idle')
    setLlmLatencyMs(null)
    setTestErrorMessage(null)
  }

  const updateActive = (patch: Partial<AiPreset>) => {
    updateConfig({
      ai_presets: presets.map((preset) =>
        preset.id === active.id ? { ...preset, ...patch } : preset,
      ),
    })
    resetTest()
  }

  const handleExtraFieldsChange = (text: string) => {
    setExtraFieldsDraft(text)
    const parsed = parseExtraFields(text)
    if (parsed === null) {
      // Keep the last valid value in the config; only show the error.
      setExtraFieldsInvalid(true)
      return
    }
    setExtraFieldsInvalid(false)
    updateActive({ extra_request_fields: parsed })
  }

  const doFetchModels = useCallback(
    async (baseUrl: string, apiKey: string) => {
      if (!baseUrl || hasPlaceholder(baseUrl)) return
      setFetchingModels(true)
      try {
        const list = await fetchAiModels(baseUrl, apiKey)
        setModels(list)
      } catch {
        // Do not clear existing cache on failure — avoids infinite retry loop
        // (clearing would re-trigger the useEffect that checks models.length > 0)
      } finally {
        setFetchingModels(false)
      }
    },
    [setModels],
  )

  // Auto-fetch when the base URL or API key changes (debounced); skips if models are cached
  useEffect(() => {
    if (!active.base_url || hasPlaceholder(active.base_url)) return
    if (models.length > 0) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doFetchModels(active.base_url, llmApiKey)
    }, 500)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [active.base_url, doFetchModels, llmApiKey, models.length])

  const handleTest = async () => {
    setLlmLatencyMs(null)
    setTestErrorMessage(null)
    if (hasPlaceholder(active.base_url)) {
      setTestErrorMessage(t('presets.placeholderUrl'))
      setLlmTestStatus('error')
      return
    }
    setLlmTestStatus('testing')
    const tested = active
    try {
      const ms = await testAiPreset(tested, llmApiKey)
      setLlmLatencyMs(ms)
      setLlmTestStatus('success')
      recordTestPassed('ai', tested)
      recordAiResult(true)
    } catch (err) {
      console.error('[LLM Test] Error:', err)
      setTestErrorMessage(err instanceof Error ? err.message : typeof err === 'string' ? err : null)
      setLlmTestStatus('error')
      recordAiResult(false)
    }
  }

  return (
    <>
      <Group label={t('settings.groupPreset')}>
        <PresetPicker
          presets={presets}
          activeId={active.id}
          onChange={(ai_presets, active_ai_preset_id) => {
            updateConfig({ ai_presets, active_ai_preset_id })
            resetTest()
            if (active_ai_preset_id !== active.id) setModels([])
          }}
          onCreated={(_source, created) => {
            // A copy starts with the same API key as the preset it came from.
            if (llmApiKey) {
              setCredential('llm', created.id, llmApiKey).catch((error) =>
                console.error('[credentials] failed to copy AI key', error),
              )
            }
          }}
        />
      </Group>

      <Group label={t('settings.groupServer')}>
        <Row label={t('settings.baseUrl')} layout="wide">
          <input
            aria-label={t('settings.baseUrl')}
            value={active.base_url}
            onChange={(e) => {
              updateActive({ base_url: e.target.value })
              setModels([])
            }}
            placeholder={BUILTIN_AI_PRESET.base_url}
            className={inputClass}
          />
        </Row>

        <Row
          label={t('settings.model')}
          help={
            models.length > 0 ? t('settings.modelsAvailable', { count: models.length }) : undefined
          }
          layout="wide"
        >
          <input
            aria-label={t('settings.model')}
            list="llm-model-list"
            value={active.model}
            onChange={(e) => updateActive({ model: e.target.value })}
            placeholder={BUILTIN_AI_PRESET.model}
            className={inputClass}
          />
          <datalist id="llm-model-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => doFetchModels(active.base_url, llmApiKey)}
            disabled={fetchingModels || !active.base_url}
            className="btn-icon"
            title={t('settings.fetchModels')}
            aria-label={t('settings.fetchModels')}
          >
            <RefreshCw size={13} className={fetchingModels ? 'animate-spin' : ''} />
          </button>
        </Row>

        <Row
          label={t('presets.extraFields')}
          help={
            extraFieldsInvalid ? (
              <span className="text-error">{t('presets.extraFieldsInvalid')}</span>
            ) : (
              t('presets.extraFieldsHint')
            )
          }
          layout="stacked"
        >
          <textarea
            aria-label={t('presets.extraFields')}
            value={extraFieldsDraft}
            onChange={(e) => handleExtraFieldsChange(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'{"reasoning_effort": "none"}'}
            className={`resize-y ${inputClass}`}
          />
        </Row>

        <Row
          label={t('presets.apiKeyOptional')}
          help={
            credentialErrorMessage ? (
              <span className="text-error">
                {t('settings.credentialSaveFailed', { details: credentialErrorMessage })}
              </span>
            ) : (
              t('settings.storedLocally')
            )
          }
          layout="wide"
        >
          <input
            type="password"
            aria-label={t('presets.apiKeyOptional')}
            value={llmApiKey}
            onChange={(e) => {
              setLlmApiKey(e.target.value)
              resetTest()
            }}
            onBlur={saveLlmApiKeyNow}
            placeholder={t('presets.apiKeyPlaceholder')}
            className={inputClass}
          />
        </Row>

        <Row
          label={t('settings.connection')}
          help={
            <>
              <span className="block">{t('presets.aiTestHelp')}</span>
              {(llmTestStatus === 'success' || llmTestStatus === 'error') && (
                <TestFeedback
                  status={llmTestStatus}
                  latencyMs={llmLatencyMs}
                  errorMessage={testErrorMessage}
                />
              )}
            </>
          }
        >
          <button
            type="button"
            onClick={handleTest}
            disabled={
              !active.base_url.trim() ||
              !active.model.trim() ||
              extraFieldsInvalid ||
              llmTestStatus === 'testing'
            }
            className="btn-accent"
          >
            {llmTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('settings.test')}
          </button>
        </Row>
      </Group>
    </>
  )
}
