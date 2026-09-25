import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { readCredential } from '../../lib/tauri'
import { parseExtraFields } from '../../lib/extraFields'
import { addressHostname, formatTestTime } from '../../lib/speechTypes'
import type { AiPreset } from '../../stores/appStore'
import { saveServerPreset } from './saveSpeech'
import { SPEECH_SERVICE, type AnyPreset, type EngineService } from './services'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; ms: number; tested: AnyPreset; key: string }
  | { status: 'error'; message: string }

interface Props {
  /** The saved preset to edit, or null for a new one. */
  preset: AnyPreset | null
  /** "Save and use" in the sheet, "Save" in Settings. */
  saveLabel: string
  /** The quiet action at the left of the button line (Cancel, ← Saved presets, Delete). */
  secondary?: React.ReactNode
  /** Called after the preset was saved and made the one in use. */
  onSaved?: (preset: AnyPreset) => void
  /** Speech (default) or AI. */
  service?: EngineService
}

/** Shows extra request fields as editable JSON; an empty object shows as an empty box. */
function formatExtraFields(fields: Record<string, unknown> | undefined): string {
  return !fields || Object.keys(fields).length === 0 ? '' : JSON.stringify(fields, null, 2)
}

/**
 * Plan 0015 (speech) and 0017 (AI): the form for a server or API key (any OpenAI-compatible
 * service). Four fields with the OpenAI example as placeholders; Name fills itself with the
 * address's host until the user types a name. AI presets also have "Extra fields" (JSON) under
 * a collapsed Advanced. Test shows its result on the same line as the buttons.
 */
export function ServerPresetForm({
  preset,
  saveLabel,
  secondary,
  onSaved,
  service = SPEECH_SERVICE,
}: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<AnyPreset>(() =>
    preset ? { ...preset } : service.newPreset(),
  )
  // A saved name that is not simply the host counts as typed by the user.
  const [nameEdited, setNameEdited] = useState(
    () => preset !== null && preset.name !== addressHostname(preset.base_url),
  )
  const [apiKey, setApiKey] = useState('')
  const savedKey = useRef('')
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savedExtra = (preset as AiPreset | null)?.extra_request_fields
  const [extraText, setExtraText] = useState(() => formatExtraFields(savedExtra))
  const [advancedOpen, setAdvancedOpen] = useState(() => formatExtraFields(savedExtra) !== '')
  const extraInvalid = service.extraFields && parseExtraFields(extraText) === null

  useEffect(() => {
    let cancelled = false
    savedKey.current = ''
    if (!preset) return
    readCredential(service.credential, preset.id)
      .then((secret) => {
        if (cancelled) return
        savedKey.current = secret ?? ''
        setApiKey((typed) => typed || (secret ?? ''))
      })
      .catch((error) => console.error(`[${service.id}] failed to read the API key`, error))
    return () => {
      cancelled = true
    }
  }, [preset, service])

  const change = (patch: Partial<AnyPreset>) => {
    setDraft((previous) => ({ ...previous, ...patch }) as AnyPreset)
    setTest({ status: 'idle' })
    setSaveError(null)
  }

  const changeAddress = (base_url: string) => {
    change(nameEdited ? { base_url } : { base_url, name: addressHostname(base_url) })
  }

  const changeExtra = (text: string) => {
    setExtraText(text)
    const parsed = parseExtraFields(text)
    // Keep the last valid value in the draft; the error shows under the box.
    if (parsed) change({ extra_request_fields: parsed } as Partial<AiPreset>)
  }

  const complete = Boolean(draft.base_url.trim() && draft.model.trim()) && !extraInvalid

  const handleTest = async () => {
    setTest({ status: 'testing' })
    const tested = { ...draft }
    try {
      const ms = await service.test(tested, apiKey)
      setTest({ status: 'ok', ms, tested, key: apiKey })
      service.recordResult(true)
    } catch (error) {
      setTest({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : t('settings.connectionFailed'),
      })
      service.recordResult(false)
    }
  }

  const handleSave = async () => {
    const name =
      draft.name.trim() || addressHostname(draft.base_url) || draft.model.trim() || draft.id
    const passed =
      test.status === 'ok' && test.key === apiKey && service.sameConnection(test.tested, draft)
    const keyChanged = apiKey !== savedKey.current
    const unchanged = preset !== null && !keyChanged && service.sameConnection(preset, draft)
    const saved = {
      ...draft,
      name,
      builtin: false,
      verified_at: passed ? Date.now() : unchanged ? preset.verified_at : null,
    } as AnyPreset
    setSaving(true)
    setSaveError(null)
    try {
      await saveServerPreset(service, saved, { value: apiKey, changed: keyChanged })
      savedKey.current = apiKey
      setDraft(saved)
      onSaved?.(saved)
    } catch (error) {
      setSaveError(String(error))
    } finally {
      setSaving(false)
    }
  }

  const fieldClass = 'field font-mono text-[12px]'
  const id = (field: string) => `${service.textNs}-${field}-${draft.id}`

  return (
    <div>
      <div className="form-grid">
        <label htmlFor={id('address')}>{t('speech.address')}</label>
        <input
          id={id('address')}
          value={draft.base_url}
          onChange={(event) => changeAddress(event.target.value)}
          placeholder={service.placeholders.address}
          spellCheck={false}
          className={fieldClass}
        />
        <label htmlFor={id('model')}>{t('speech.model')}</label>
        <input
          id={id('model')}
          value={draft.model}
          onChange={(event) => change({ model: event.target.value })}
          placeholder={service.placeholders.model}
          spellCheck={false}
          className={fieldClass}
        />
        <label htmlFor={id('key')}>{t('speech.apiKey')}</label>
        <input
          id={id('key')}
          type="password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value)
            setTest({ status: 'idle' })
          }}
          placeholder={t('speech.apiKeyPlaceholder')}
          className={fieldClass}
        />
        <label htmlFor={id('name')}>{t('speech.name')}</label>
        <input
          id={id('name')}
          value={draft.name}
          onChange={(event) => {
            setNameEdited(event.target.value !== '')
            change({ name: event.target.value })
          }}
          placeholder={t('speech.namePlaceholder')}
          className="field text-[12.5px]"
        />
      </div>
      {service.extraFields && (
        <div className="mt-2.5">
          <button
            type="button"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((open) => !open)}
            className="disclosure"
          >
            {t('ai.advanced')}
          </button>
          {advancedOpen && (
            <div className="form-grid mt-2">
              <label htmlFor={id('extra')}>{t('ai.extraFields')}</label>
              <div className="min-w-0">
                <textarea
                  id={id('extra')}
                  value={extraText}
                  onChange={(event) => changeExtra(event.target.value)}
                  rows={2}
                  spellCheck={false}
                  placeholder={'{"reasoning_effort": "none"}'}
                  className={`${fieldClass} w-full resize-y`}
                />
                <span
                  className={`block text-[11.5px] ${extraInvalid ? 'text-error' : 'text-text-secondary'}`}
                >
                  {extraInvalid ? t('presets.extraFieldsInvalid') : t('ai.extraFieldsHint')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {secondary}
        <span className="flex-1" />
        <TestResult test={test} saveError={saveError} />
        <button
          type="button"
          onClick={handleTest}
          disabled={!complete || test.status === 'testing'}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {test.status === 'testing' && <Loader2 size={12} className="animate-spin" />}
          {t('speech.test')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!complete || saving}
          className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

function TestResult({ test, saveError }: { test: TestState; saveError: string | null }) {
  const { t } = useTranslation()
  if (saveError) {
    return <span className="min-w-0 text-[12px] text-error">{saveError}</span>
  }
  switch (test.status) {
    case 'testing':
      return <span className="text-[12px] text-text-secondary">{t('speech.testing')}</span>
    case 'ok':
      return (
        <span className="text-[12px] text-success">
          {t('speech.works', { time: formatTestTime(test.ms) })}
        </span>
      )
    case 'error':
      return <span className="min-w-0 break-words text-[12px] text-error">{test.message}</span>
    default:
      return null
  }
}
