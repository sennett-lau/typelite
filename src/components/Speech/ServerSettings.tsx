import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { deleteServerPreset, selectPreset } from './saveSpeech'
import { ServerPresetForm } from './ServerPresetForm'
import {
  SPEECH_SERVICE,
  activePresetOf,
  builtinPresetOf,
  serverPresetsOf,
  type EngineService,
} from './services'
import { PresetShareButtons } from '../Settings/PresetShareButtons'

const ADD = '__add__'

/**
 * Settings → Speech / AI → "Your server or API key" details (plans `two-tab-speech` and
 * `ai-polish-setup`). With saved presets: a "Preset" header with the picker at the upper right
 * (saved presets and "+ Add preset…"), the fields of the selected preset, Test and Save on one
 * line, and "Delete this preset". With none: "Add your server or API key" and the empty form.
 * ("Learn more" sits on the page's "… uses" header.)
 */
export function ServerSettings({ service = SPEECH_SERVICE }: { service?: EngineService }) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const saved = serverPresetsOf(service, config)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeId = activePresetOf(service, config)?.id
  const selected = saved.find((preset) => preset.id === activeId) ?? saved[0] ?? null
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
    void run(selectPreset(service, value))
  }

  const handleDelete = () => {
    if (!selected) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setConfirmDelete(false)
    const next = saved.find((preset) => preset.id !== selected.id)
    const fallback = next?.id ?? builtinPresetOf(service, config)?.id ?? service.builtinId
    void run(deleteServerPreset(service, selected.id, fallback))
  }

  return (
    <div data-testid="server-settings">
      <div className="mx-1 mt-5 mb-[7px] flex flex-wrap items-end justify-between gap-2.5">
        {saved.length > 0 ? (
          <>
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
          </>
        ) : (
          <span className="group-label m-0">{t('speech.addTitle')}</span>
        )}
      </div>

      <div className="row-group px-3.5 py-3">
        <ServerPresetForm
          key={showForm?.id ?? 'new'}
          service={service}
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

      {/* Plan `preset-sharing`: export and import speech or AI presets. */}
      <PresetShareButtons service={service.id} />
    </div>
  )
}
