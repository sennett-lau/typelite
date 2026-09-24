import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BUILTIN_SPEECH_PRESET,
  findActivePreset,
  useAppStore,
  type SpeechPreset,
} from '../../stores/appStore'
import { LANGUAGES } from '../../lib/constants'
import {
  getSttRecordingCapability,
  setCredential,
  testSpeechPreset,
  type ResolvedSttRecordingLimit,
} from '../../lib/tauri'
import { usePresetApiKey } from '../../hooks/usePresetApiKey'
import { Group, Row } from '../ui/Group'
import { PresetPicker } from './PresetPicker'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { recordSpeechResult } from '../../lib/connectionStatus'

const RECORDING_LIMIT_PRESETS = [30, 60, 120, 300, 600, 1800, 3600]
const MIN_CUSTOM_RECORDING_SECONDS = 30

/** Text fields hold technical values (URLs, model names), so they use SF Mono. */
const inputClass = 'field w-full min-w-0 font-mono text-[12px]'

function formatRecordingDuration(
  seconds: number,
  t: (key: string, values?: Record<string, number>) => string,
) {
  if (seconds === 60) return t('recordingLimits.durationMinute', { count: 1 })
  if (seconds > 0 && seconds % 60 === 0) {
    return t('recordingLimits.durationMinutes', { count: seconds / 60 })
  }
  return t('recordingLimits.durationSeconds', { count: seconds })
}

export function SttPane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const setSttTestStatus = useAppStore((s) => s.setSttTestStatus)
  const sttLatencyMs = useAppStore((s) => s.sttLatencyMs)
  const setSttLatencyMs = useAppStore((s) => s.setSttLatencyMs)
  const { t } = useTranslation()
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null)
  const [recordingLimit, setRecordingLimit] = useState<ResolvedSttRecordingLimit | null>(null)
  const [customDurationEntryRequested, setCustomDurationEntryRequested] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    setRecordingLimit(null)
    getSttRecordingCapability(config.recording_limit_mode, config.custom_recording_limit_seconds)
      .then((resolved) => {
        if (!cancelled) setRecordingLimit(resolved)
      })
      .catch((error) => {
        console.error('[stt] failed to resolve recording limit', error)
        if (!cancelled) setRecordingLimit(null)
      })

    return () => {
      cancelled = true
    }
  }, [config.custom_recording_limit_seconds, config.recording_limit_mode])

  useEffect(() => {
    if (config.recording_limit_mode === 'auto') {
      setCustomDurationEntryRequested(false)
    }
  }, [config.recording_limit_mode])

  const handleTest = async () => {
    setSttTestStatus('testing')
    setSttLatencyMs(null)
    setTestErrorMessage(null)
    try {
      const ms = await testSpeechPreset(active, apiKey)
      setSttLatencyMs(ms)
      setSttTestStatus('success')
      recordSpeechResult(true)
    } catch (err) {
      console.error('[STT Test] Error:', err)
      setTestErrorMessage(err instanceof Error ? err.message : typeof err === 'string' ? err : null)
      setSttTestStatus('error')
      recordSpeechResult(false)
    }
  }

  const availableRecordingPresets = recordingLimit
    ? RECORDING_LIMIT_PRESETS.filter(
        (seconds) => seconds <= recordingLimit.capability.hardMaxSeconds,
      )
    : []
  const savedDurationIsPreset =
    recordingLimit !== null &&
    availableRecordingPresets.includes(config.custom_recording_limit_seconds)
  const canEnterCustomDuration =
    recordingLimit !== null &&
    recordingLimit.capability.hardMaxSeconds > MIN_CUSTOM_RECORDING_SECONDS
  const recordingDurationValue =
    config.recording_limit_mode === 'auto'
      ? 'auto'
      : customDurationEntryRequested && canEnterCustomDuration
        ? 'custom'
        : savedDurationIsPreset
          ? String(config.custom_recording_limit_seconds)
          : canEnterCustomDuration
            ? 'custom'
            : String(recordingLimit?.effectiveMaxSeconds ?? MIN_CUSTOM_RECORDING_SECONDS)
  const showCustomDurationEntry =
    canEnterCustomDuration &&
    (customDurationEntryRequested ||
      (config.recording_limit_mode === 'custom' && !savedDurationIsPreset))
  const recordingLimitHelper = recordingLimit
    ? showCustomDurationEntry
      ? t('recordingLimits.allowedRangeWithReason', {
          min: formatRecordingDuration(MIN_CUSTOM_RECORDING_SECONDS, t),
          max: formatRecordingDuration(recordingLimit.capability.hardMaxSeconds, t),
          reason: t(recordingLimit.capability.explanationKey),
        })
      : config.recording_limit_mode === 'custom'
        ? t('recordingLimits.currentSelectionWithLimit', {
            current: formatRecordingDuration(recordingLimit.effectiveMaxSeconds, t),
            max: formatRecordingDuration(recordingLimit.capability.hardMaxSeconds, t),
            reason: t(recordingLimit.capability.explanationKey),
          })
        : t(recordingLimit.capability.explanationKey)
    : null

  const handleRecordingDurationChange = (value: string) => {
    if (value === 'auto') {
      setCustomDurationEntryRequested(false)
      updateConfig({ recording_limit_mode: 'auto' })
      return
    }
    if (value === 'custom') {
      setCustomDurationEntryRequested(true)
      updateConfig({ recording_limit_mode: 'custom' })
      return
    }

    const seconds = Number(value)
    if (!Number.isFinite(seconds)) return
    setCustomDurationEntryRequested(false)
    updateConfig({
      recording_limit_mode: 'custom',
      custom_recording_limit_seconds: seconds,
    })
  }

  return (
    <div>
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
            sttTestStatus === 'success' ? (
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 size={12} />{' '}
                {sttLatencyMs !== null
                  ? t('presets.latency', { ms: sttLatencyMs })
                  : t('settings.connectionSuccess')}
              </span>
            ) : sttTestStatus === 'error' ? (
              <span className="flex items-start gap-1 text-error">
                <XCircle size={12} className="mt-[2px] flex-shrink-0" />
                <span>{testErrorMessage || t('settings.connectionFailed')}</span>
              </span>
            ) : undefined
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

      <Group label={t('settings.groupRecording')}>
        <Row
          label={t('settings.maxRecordingDuration')}
          help={
            recordingLimit ? (
              <>
                {recordingLimitHelper}
                {config.recording_limit_mode === 'custom' &&
                  recordingLimit.requestedSeconds !== recordingLimit.effectiveMaxSeconds && (
                    <span className="block text-warning">
                      {t('recordingLimits.corrected', {
                        duration: formatRecordingDuration(recordingLimit.effectiveMaxSeconds, t),
                      })}
                    </span>
                  )}
              </>
            ) : (
              t('recordingLimits.loading')
            )
          }
        >
          {recordingLimit && (
            <select
              aria-label={t('settings.maxRecordingDuration')}
              value={recordingDurationValue}
              onChange={(event) => handleRecordingDurationChange(event.target.value)}
              className="popup"
            >
              <option value="auto">
                {t('recordingLimits.auto', {
                  duration: formatRecordingDuration(
                    recordingLimit.capability.recommendedMaxSeconds,
                    t,
                  ),
                })}
              </option>
              {availableRecordingPresets.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {formatRecordingDuration(seconds, t)}
                </option>
              ))}
              {canEnterCustomDuration && (
                <option value="custom">{t('recordingLimits.numericEntry')}</option>
              )}
            </select>
          )}
        </Row>

        {recordingLimit && showCustomDurationEntry && (
          <Row label={t('recordingLimits.customDuration')} htmlFor="custom-recording-duration">
            <input
              id="custom-recording-duration"
              aria-label={t('recordingLimits.customDuration')}
              type="number"
              min={MIN_CUSTOM_RECORDING_SECONDS}
              max={recordingLimit.capability.hardMaxSeconds}
              step={1}
              value={config.custom_recording_limit_seconds}
              onChange={(event) => {
                const seconds = Number(event.target.value)
                if (Number.isFinite(seconds) && seconds >= 0) {
                  updateConfig({ custom_recording_limit_seconds: Math.floor(seconds) })
                }
              }}
              className="field w-[96px] text-right"
            />
            <span className="text-[12px] text-text-secondary" aria-hidden="true">
              {t('recordingLimits.secondsUnit')}
            </span>
          </Row>
        )}
      </Group>
    </div>
  )
}
