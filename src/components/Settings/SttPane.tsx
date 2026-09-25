import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { getSttRecordingCapability, type ResolvedSttRecordingLimit } from '../../lib/tauri'
import { activeSpeechPreset } from '../../lib/connectionStatus'
import { LANGUAGES } from '../../lib/constants'
import { Group, Row } from '../ui/Group'
import { SpeechEngineChoice } from '../Speech/SpeechEngineChoice'

const RECORDING_LIMIT_PRESETS = [30, 60, 120, 300, 600, 1800, 3600]
const MIN_CUSTOM_RECORDING_SECONDS = 30

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
  const { t } = useTranslation()
  const [recordingLimit, setRecordingLimit] = useState<ResolvedSttRecordingLimit | null>(null)
  const [customDurationEntryRequested, setCustomDurationEntryRequested] = useState(false)

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

  // Plan 0015: the language belongs to the preset in use; edits go through the Save bar.
  const active = activeSpeechPreset(config)
  const handleLanguageChange = (language: string) => {
    updateConfig({
      speech_presets: config.speech_presets.map((preset) =>
        preset.id === active.id ? { ...preset, language } : preset,
      ),
    })
  }

  return (
    <div>
      <SpeechEngineChoice />

      <Group label={t('speech.languageGroup')}>
        <Row label={t('speech.spokenLanguage')} help={t('speech.spokenLanguageHelp')}>
          <select
            aria-label={t('speech.spokenLanguage')}
            value={active.language || 'auto'}
            onChange={(event) => handleLanguageChange(event.target.value)}
            className="popup"
          >
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {language.labelKey ? t(language.labelKey) : language.label}
              </option>
            ))}
          </select>
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
