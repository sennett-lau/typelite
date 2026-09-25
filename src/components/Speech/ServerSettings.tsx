import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { builtinWhisperPreset, serverPresets } from '../../lib/speechTypes'
import { BUILTIN_WHISPER_PRESET_ID, useAppStore } from '../../stores/appStore'
import { deleteServerPreset, selectSpeechPreset } from './saveSpeech'
import { LearnMoreLink } from './LearnMoreLink'
import { ServerPresetForm } from './ServerPresetForm'
import { PresetShareButtons } from '../Settings/PresetShareButtons'

const ADD = '__add__'

/**
 * Settings → Speech → "Your server or API key" details (plan `two-tab-speech`). With saved presets:
 * a "Preset" header with the picker at the upper right (saved presets and "+ Add preset…"), the
 * four fields of the selected preset, Test and Save on one line, "Delete this preset", and a
 * "Learn more" line. With none: "Add your server or API key" + Learn more, and the empty form.
 */
export function ServerSettings() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const saved = serverPresets(config.speech_presets)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected =
    saved.find((preset) => preset.id === config.active_speech_preset_id) ?? saved[0] ?? null
  const showForm = adding || selected === null ? null : selected

  const run = (action: Promise<void>) =>
    action.catch((err) => {
      setError(String(err))
    })

  const handlePick = (value: string) => {
    setConfirmDelete(false)
    setError(null)
    if (value === ADD) {
      setAdding(true)
      return
    }
    setAdding(false)
    void run(selectSpeechPreset(value))
  }

  const handleDelete = () => {
    if (!selected) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    const next = saved.find((preset) => preset.id !== selected.id)
    const fallback =
      next?.id ?? builtinWhisperPreset(config.speech_presets)?.id ?? BUILTIN_WHISPER_PRESET_ID
    void run(deleteServerPreset(selected.id, fallback))
  }

  return (
    <div data-testid="server-settings">
      {saved.length > 0 ? (
        <div className="mx-1 mt-5 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
          <span className="group-label m-0">{t('speech.presetLabel')}</span>
          <select
            aria-label={t('speech.savedPresets')}
            value={adding ? ADD : (selected?.id ?? '')}
            onChange={(event) => handlePick(event.target.value)}
            className="popup max-w-[220px] text-[12px]"
          >
            {saved.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
            <option value={ADD}>{t('speech.addPresetMenu')}</option>
          </select>
        </div>
      ) : (
        <div className="mx-1 mt-5 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
          <span className="group-label m-0">{t('speech.addTitle')}</span>
          <LearnMoreLink />
        </div>
      )}

      <div className="row-group px-3.5 py-3">
        <ServerPresetForm
          key={showForm?.id ?? 'new'}
          preset={showForm}
          saveLabel={t('speech.save')}
          onSaved={() => setAdding(false)}
          secondary={
            showForm ? (
              <button
                type="button"
                onClick={handleDelete}
                onBlur={() => setConfirmDelete(false)}
                className="link-button link-button-muted"
              >
                {confirmDelete ? t('speechSetup.confirmDelete') : t('speech.deletePreset')}
              </button>
            ) : undefined
          }
        />
        {error && <p className="m-0 mt-2 text-[12px] text-error">{error}</p>}
      </div>

      {saved.length > 0 && (
        <p className="m-0 mx-1 mt-2 text-[12px] text-text-secondary">
          <LearnMoreLink /> {t('speech.learnMoreAbout')}
        </p>
      )}

      {/* Plan 0019: export and import speech presets. */}
      <PresetShareButtons service="speech" />
    </div>
  )
}
