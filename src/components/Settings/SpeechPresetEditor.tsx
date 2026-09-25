import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  BUILTIN_SPEECH_PRESET,
  findActivePreset,
  useAppStore,
  type SpeechPreset,
} from '../../stores/appStore'
import { LANGUAGES } from '../../lib/constants'
import { setCredential, testSpeechPreset } from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { recordSpeechResult } from '../../lib/connectionStatus'
import { hasPlaceholder, recordTestPassed } from '../../lib/readiness'
import { Group, Row } from '../ui/Group'
import { PresetPicker } from './PresetPicker'

/** Text fields hold technical values (URLs, model names), so they use SF Mono. */
const inputClass = 'field w-full min-w-0 font-mono text-[12px]'

/**
 * The speech preset editor: preset picker (rename, save as new, delete), base URL, model,
 * language, optional API key and Test. Used by Settings → Speech and by the onboarding
 * speech step, so both always work the same way.
 */
export function SpeechPresetEditor() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const setSttTestStatus = useAppStore((s) => s.setSttTestStatus)
  const sttLatencyMs = useAppStore((s) => s.sttLatencyMs)
  const setSttLatencyMs = useAppStore((s) => s.setSttLatencyMs)
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null)

  const presets = config.speech_presets?.length ? config.speech_presets : [BUILTIN_SPEECH_PRESET]
  const active = findActivePreset(presets, config.active_speech_preset_id) ?? presets[0]
  const { apiKey, setApiKey, saveNow, saveError } = usePresetApiKey('stt', active.id)
  const canTest = Boolean(active.base_url.trim() && active.model.trim())

  const resetTest = () => {
    setSttTestStatus('idle')
    setSttLatencyMs(null)
    setTestErrorMessage(null)
  }

  const updateActive = (patch: Partial<SpeechPreset>) => {
    updateConfig({
      speech_presets: presets.map((preset) =>
        preset.id === active.id ? { ...preset, ...patch } : preset,
      ),
    })
    resetTest()
  }

  const handleTest = async () => {
    setSttLatencyMs(null)
    setTestErrorMessage(null)
    if (hasPlaceholder(active.base_url)) {
      setTestErrorMessage(t('presets.placeholderUrl'))
      setSttTestStatus('error')
      return
    }
    setSttTestStatus('testing')
    const tested = active
    try {
      const ms = await testSpeechPreset(tested, apiKey)
      setSttLatencyMs(ms)
      setSttTestStatus('success')
      recordTestPassed('speech', tested)
      recordSpeechResult(true)
    } catch (err) {
      console.error('[STT Test] Error:', err)
      setTestErrorMessage(err instanceof Error ? err.message : typeof err === 'string' ? err : null)
      setSttTestStatus('error')
      recordSpeechResult(false)
    }
  }

  return (
    <>
      <Group label={t('settings.groupPreset')}>
        <PresetPicker
          presets={presets}
          activeId={active.id}
          onChange={(speech_presets, active_speech_preset_id) => {
            updateConfig({ speech_presets, active_speech_preset_id })
            resetTest()
          }}
          onCreated={(_source, created) => {
            // A copy starts with the same API key as the preset it came from.
            if (apiKey) {
              setCredential('stt', created.id, apiKey).catch((error) =>
                console.error('[credentials] failed to copy STT key', error),
              )
            }
          }}
        />
      </Group>

      <Group label={t('settings.groupServer')}>
        <Row label={t('settings.baseUrl')} help={t('presets.speechServerHint')} layout="wide">
          <input
            aria-label={t('settings.baseUrl')}
            value={active.base_url}
            onChange={(e) => updateActive({ base_url: e.target.value })}
            placeholder={BUILTIN_SPEECH_PRESET.base_url}
            className={inputClass}
          />
        </Row>

        <Row label={t('settings.model')} layout="wide">
          <input
            aria-label={t('settings.model')}
            value={active.model}
            onChange={(e) => updateActive({ model: e.target.value })}
            placeholder={BUILTIN_SPEECH_PRESET.model}
            className={inputClass}
          />
        </Row>

        <Row label={t('settings.sttLanguage')}>
          <select
            aria-label={t('settings.sttLanguage')}
            value={active.language || 'auto'}
            onChange={(e) => updateActive({ language: e.target.value })}
            className="popup"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.labelKey ? t(l.labelKey) : l.label}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label={t('presets.apiKeyOptional')}
          help={
            saveError ? (
              <span className="text-error">
                {t('settings.credentialSaveFailed', { details: saveError })}
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
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
              resetTest()
            }}
            onBlur={saveNow}
            placeholder={t('presets.apiKeyPlaceholder')}
            className={inputClass}
          />
        </Row>

        <Row
          label={t('settings.connection')}
          help={
            <>
              <span className="block">{t('presets.speechTestHelp')}</span>
              {(sttTestStatus === 'success' || sttTestStatus === 'error') && (
                <TestFeedback
                  status={sttTestStatus}
                  latencyMs={sttLatencyMs}
                  errorMessage={testErrorMessage}
                />
              )}
            </>
          }
        >
          <button
            type="button"
            onClick={handleTest}
            disabled={!canTest || sttTestStatus === 'testing'}
            className="btn-accent"
          >
            {sttTestStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
            {t('settings.test')}
          </button>
        </Row>
      </Group>
    </>
  )
}

/** The result line under the Test button: latency after a pass, the reason after a failure. */
export function TestFeedback({
  status,
  latencyMs,
  errorMessage,
}: {
  status: string
  latencyMs: number | null
  errorMessage: string | null
}) {
  const { t } = useTranslation()
  if (status === 'success') {
    return (
      <span className="flex items-center gap-1 text-success">
        <CheckCircle2 size={12} />{' '}
        {latencyMs !== null
          ? t('presets.latency', { ms: latencyMs })
          : t('settings.connectionSuccess')}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-start gap-1 text-error">
        <XCircle size={12} className="mt-[2px] flex-shrink-0" />
        <span>{errorMessage || t('settings.connectionFailed')}</span>
      </span>
    )
  }
  return null
}
