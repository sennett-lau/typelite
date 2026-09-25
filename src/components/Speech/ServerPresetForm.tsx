import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { readCredential, testSpeechPreset } from '../../lib/tauri'
import { recordSpeechResult } from '../../lib/connectionStatus'
import { sameSpeechConnection, type SpeechPreset } from '../../stores/appStore'
import { SERVER_PLACEHOLDERS, addressHostname, formatTestTime } from '../../lib/speechTypes'
import { saveServerPreset } from './saveSpeech'

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; ms: number; tested: SpeechPreset; key: string }
  | { status: 'error'; message: string }

function newPreset(): SpeechPreset {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind: 'openai_compatible',
    base_url: '',
    model: '',
    model_file: '',
    language: 'auto',
    builtin: false,
    verified_at: null,
  }
}

interface Props {
  /** The saved preset to edit, or null for a new one. */
  preset: SpeechPreset | null
  /** "Save and use" in the sheet, "Save" in Settings. */
  saveLabel: string
  /** The quiet action at the left of the button line (Cancel, ← Saved presets, Delete). */
  secondary?: React.ReactNode
  /** Called after the preset was saved and made the one in use. */
  onSaved?: (preset: SpeechPreset) => void
}

/**
 * Plan 0015: the form for a server or API key (any OpenAI-compatible speech service). Four
 * fields with the OpenAI example as placeholders; Name fills itself with the address's host
 * until the user types a name. Test shows its result on the same line as the buttons.
 */
export function ServerPresetForm({ preset, saveLabel, secondary, onSaved }: Props) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<SpeechPreset>(() => (preset ? { ...preset } : newPreset()))
  // A saved name that is not simply the host counts as typed by the user.
  const [nameEdited, setNameEdited] = useState(
    () => preset !== null && preset.name !== addressHostname(preset.base_url),
  )
  const [apiKey, setApiKey] = useState('')
  const savedKey = useRef('')
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    savedKey.current = ''
    if (!preset) return
    readCredential('stt', preset.id)
      .then((secret) => {
        if (cancelled) return
        savedKey.current = secret ?? ''
        setApiKey((typed) => typed || (secret ?? ''))
      })
      .catch((error) => console.error('[speech] failed to read the API key', error))
    return () => {
      cancelled = true
    }
  }, [preset])

  const change = (patch: Partial<SpeechPreset>) => {
    setDraft((previous) => ({ ...previous, ...patch }))
    setTest({ status: 'idle' })
    setSaveError(null)
  }

  const changeAddress = (base_url: string) => {
    change(nameEdited ? { base_url } : { base_url, name: addressHostname(base_url) })
  }

  const complete = Boolean(draft.base_url.trim() && draft.model.trim())

  const handleTest = async () => {
    setTest({ status: 'testing' })
    const tested = { ...draft }
    try {
      const ms = await testSpeechPreset(tested, apiKey)
      setTest({ status: 'ok', ms, tested, key: apiKey })
      recordSpeechResult(true)
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
      recordSpeechResult(false)
    }
  }

  const handleSave = async () => {
    const name =
      draft.name.trim() || addressHostname(draft.base_url) || draft.model.trim() || draft.id
    const passed =
      test.status === 'ok' && test.key === apiKey && sameSpeechConnection(test.tested, draft)
    const keyChanged = apiKey !== savedKey.current
    const unchanged = preset !== null && !keyChanged && sameSpeechConnection(preset, draft)
    const saved: SpeechPreset = {
      ...draft,
      name,
      builtin: false,
      verified_at: passed ? Date.now() : unchanged ? preset.verified_at : null,
    }
    setSaving(true)
    setSaveError(null)
    try {
      await saveServerPreset(saved, { value: apiKey, changed: keyChanged })
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
  const id = (field: string) => `speech-${field}-${draft.id}`

  return (
    <div>
      <div className="form-grid">
        <label htmlFor={id('address')}>{t('speech.address')}</label>
        <input
          id={id('address')}
          value={draft.base_url}
          onChange={(event) => changeAddress(event.target.value)}
          placeholder={SERVER_PLACEHOLDERS.address}
          spellCheck={false}
          className={fieldClass}
        />
        <label htmlFor={id('model')}>{t('speech.model')}</label>
        <input
          id={id('model')}
          value={draft.model}
          onChange={(event) => change({ model: event.target.value })}
          placeholder={SERVER_PLACEHOLDERS.model}
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
