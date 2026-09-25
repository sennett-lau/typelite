import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MAX_TRANSLATION_TARGETS, TARGET_LANGUAGES, targetLanguageLabel } from '../../lib/constants'
import type { TranslationConfig } from '../../stores/appStore'

interface TranslationTargetsProps {
  value: TranslationConfig
  onChange: (value: TranslationConfig) => void
}

/**
 * The translation languages the user chose (plan `translate-controls`): English by default, up to
 * three. Each row has a "use by default" radio and a remove button; the last language cannot be
 * removed. "Add language" shows while fewer than three are chosen. The pill shows exactly
 * these languages, and the Switch language shortcut cycles through them in this order.
 */
export function TranslationTargets({ value, onChange }: TranslationTargetsProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)

  const targets = value.targets
  const canRemove = targets.length > 1
  const canAdd = targets.length < MAX_TRANSLATION_TARGETS
  const available = TARGET_LANGUAGES.filter((language) => !targets.includes(language.value))
  const languageLabel = (code: string) => targetLanguageLabel(code, t)

  const removeTarget = (index: number) => {
    if (!canRemove) return
    const removed = targets[index]
    const next = targets.filter((_, targetIndex) => targetIndex !== index)
    const activeTarget =
      removed === value.active_target ? next[Math.min(index, next.length - 1)] : value.active_target
    onChange({ targets: next, active_target: activeTarget })
  }

  const addTarget = (code: string) => {
    setAdding(false)
    if (!code || targets.includes(code) || !canAdd) return
    onChange({ ...value, targets: [...targets, code] })
  }

  return (
    <div className="w-full space-y-2">
      <span className="block text-[13px] text-text-primary">{t('translate.targetsLabel')}</span>
      <ul
        role="radiogroup"
        aria-label={t('translate.targetsLabel')}
        className="m-0 list-none space-y-1 p-0"
      >
        {targets.map((code, index) => (
          <li
            key={code}
            data-testid={`translation-target-${code}`}
            className="flex min-w-0 items-center gap-2 rounded-[6px] bg-bg-secondary px-2.5 py-1.5"
          >
            <input
              type="radio"
              name="translation-active-target"
              checked={value.active_target === code}
              onChange={() => onChange({ ...value, active_target: code })}
              aria-label={`${t('translate.setActive')} ${languageLabel(code)}`}
              title={t('translate.setActive')}
              className="h-3.5 w-3.5 flex-none accent-accent"
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-primary">
              {languageLabel(code)}
            </span>
            {value.active_target === code && (
              <span className="flex-none text-[11px] text-text-tertiary">
                {t('translate.defaultMark')}
              </span>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => removeTarget(index)}
                aria-label={`${t('translate.remove')} ${languageLabel(code)}`}
                title={t('translate.remove')}
                className="btn-icon h-6 w-6 hover:text-error"
              >
                <X size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canAdd &&
        (adding ? (
          <select
            autoFocus
            defaultValue=""
            aria-label={t('translate.addLanguage')}
            onChange={(event) => addTarget(event.target.value)}
            onBlur={() => setAdding(false)}
            className="popup"
          >
            <option value="" disabled>
              {t('translate.chooseLanguage')}
            </option>
            {available.map((language) => (
              <option key={language.value} value={language.value}>
                {languageLabel(language.value)}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="btn-secondary inline-flex items-center gap-1"
          >
            <Plus size={12} />
            {t('translate.addLanguage')}
          </button>
        ))}
      <p className="row-help">{t('translate.switchHint')}</p>
    </div>
  )
}
