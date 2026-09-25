import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { targetLanguageLabel } from '../../lib/constants'
import { TRANSLATION_INSTRUCTIONS_MAX_CHARS, isBuiltinAi, useAppStore } from '../../stores/appStore'
import { loadTranslationDefaults, saveTranslationLanguage } from './translationLanguages'

/**
 * Plan `translation-language-presets`: the sheet behind a translation language's edit button.
 * "AI model" picks the preset that translates into this language (default "Same as AI polish");
 * "Instructions" is the editable, language-specific part of the translation prompt, filled with
 * the user's text or the built-in default.
 */
export function TranslationLanguageSheet({ code, onClose }: { code: string; onClose: () => void }) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const fieldId = useId()
  const stored = config.translation.languages?.[code]
  const presets = config.ai_presets
  const storedPresetDeleted = Boolean(
    stored?.ai_preset_id && !presets.some((preset) => preset.id === stored.ai_preset_id),
  )
  const [presetId, setPresetId] = useState(() =>
    storedPresetDeleted ? '' : (stored?.ai_preset_id ?? ''),
  )
  const [defaultText, setDefaultText] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(stored?.instructions ?? null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadTranslationDefaults()
      .then((defaults) => {
        if (cancelled) return
        const value = defaults[code] ?? ''
        setDefaultText(value)
        setText((current) => current ?? value)
      })
      .catch(() => {
        if (cancelled) return
        // The model can still be picked; empty instructions mean the default.
        setLoadError(true)
        setText((current) => current ?? '')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const title = targetLanguageLabel(code, t)
  const value = text ?? ''
  const isDefault = defaultText !== null && value.trim() === defaultText.trim()
  const ready = text !== null

  const handleSave = async () => {
    if (!ready || saving) return
    setSaving(true)
    setSaveError(null)
    const trimmed = value.trim()
    try {
      await saveTranslationLanguage(code, {
        ai_preset_id: presetId || null,
        instructions: isDefault || trimmed === '' ? null : trimmed,
      })
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-5 pt-14 pb-5">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="dialog relative z-10 flex max-h-[85vh] w-full max-w-[520px] flex-col gap-3.5 overflow-y-auto px-5 pt-[18px] pb-4"
      >
        <div>
          <h3 className="m-0 text-[15px] font-bold text-text-primary">{title}</h3>
          <p className="m-0 mt-1 text-[12px] text-text-secondary">
            {t('translate.language.sheetHelp')}
          </p>
        </div>

        <div className="form-grid">
          <label htmlFor={`${fieldId}-model`}>{t('translate.language.model')}</label>
          <div className="min-w-0">
            <select
              id={`${fieldId}-model`}
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
              className="popup"
            >
              <option value="">{t('translate.language.sameAsPolish')}</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {isBuiltinAi(preset) ? t('translate.language.builtinPreset') : preset.name}
                </option>
              ))}
            </select>
            {storedPresetDeleted && presetId === '' && (
              <span className="mt-1 block text-[11.5px] text-warning">
                {t('translate.language.presetDeleted')}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor={`${fieldId}-instructions`}
              className="text-[12.5px] font-medium text-text-primary"
            >
              {t('translate.language.instructions')}
            </label>
            {ready && !isDefault && defaultText !== null && (
              <button
                type="button"
                onClick={() => setText(defaultText)}
                className="link-button text-[12px]"
              >
                {t('translate.language.resetToDefault')}
              </button>
            )}
          </div>
          <textarea
            id={`${fieldId}-instructions`}
            value={value}
            disabled={!ready}
            onChange={(event) => setText(event.target.value)}
            maxLength={TRANSLATION_INSTRUCTIONS_MAX_CHARS}
            rows={10}
            spellCheck={false}
            className="field w-full resize-y text-[12.5px]"
          />
          <span className="text-[11.5px] text-text-secondary">
            {loadError
              ? t('translate.language.defaultsFailed')
              : t('translate.language.count', {
                  count: value.length,
                  max: TRANSLATION_INSTRUCTIONS_MAX_CHARS,
                })}
          </span>
          <span className="text-[11.5px] text-text-secondary">
            {t('translate.language.contractNote')}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex-1" />
          {saveError && (
            <span className="min-w-0 break-words text-[12px] text-error">{saveError}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!ready || saving}
            className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
