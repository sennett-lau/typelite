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
 * The translation languages the user chose (plan 0010): English by default, up to three.
 * Plan 0017: shown as chips, the default one first and marked; clicking another chip makes it
 * the default, × removes it (the last language cannot be removed), "+ Add" shows while fewer
 * than three are chosen. The pill shows exactly these languages, and the Switch language
 * shortcut cycles through them in their saved order.
 */
export function TranslationTargets({ value, onChange }: TranslationTargetsProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)

  const targets = value.targets
  const canRemove = targets.length > 1
  const canAdd = targets.length < MAX_TRANSLATION_TARGETS
  const available = TARGET_LANGUAGES.filter((language) => !targets.includes(language.value))
  const languageLabel = (code: string) => targetLanguageLabel(code, t)
  const shown = [
    ...targets.filter((code) => code === value.active_target),
    ...targets.filter((code) => code !== value.active_target),
  ]

  const removeTarget = (code: string) => {
    if (!canRemove) return
    const index = targets.indexOf(code)
    const next = targets.filter((target) => target !== code)
    const activeTarget =
      code === value.active_target ? next[Math.min(index, next.length - 1)] : value.active_target
    onChange({ targets: next, active_target: activeTarget })
  }

  const addTarget = (code: string) => {
    setAdding(false)
    if (!code || targets.includes(code) || !canAdd) return
    onChange({ ...value, targets: [...targets, code] })
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label={t('translate.targetsLabel')}
        className="flex min-w-0 flex-wrap items-center gap-1.5"
      >
        {shown.map((code) => {
          const active = value.active_target === code
          return (
            <span
              key={code}
              data-testid={`translation-target-${code}`}
              className={`lang-chip ${active ? 'lang-chip-default' : ''}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange({ ...value, active_target: code })}
                aria-label={`${t('translate.setActive')} ${languageLabel(code)}`}
                title={active ? undefined : t('translate.setActive')}
                className="lang-chip-label"
              >
                {languageLabel(code)}
                {active && ` · ${t('translate.defaultMark')}`}
              </button>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => removeTarget(code)}
                  aria-label={`${t('translate.remove')} ${languageLabel(code)}`}
                  title={t('translate.remove')}
                  className="lang-chip-remove"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          )
        })}
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
              aria-label={t('translate.addLanguage')}
              className="link-button inline-flex items-center gap-0.5"
            >
              <Plus size={12} />
              {t('translate.add')}
            </button>
          ))}
      </div>
    </div>
  )
}
