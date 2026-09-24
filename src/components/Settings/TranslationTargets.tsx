import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PILL_TRANSLATION_TARGETS, TARGET_LANGUAGES } from '../../lib/constants'
import type { TranslationConfig } from '../../stores/appStore'

interface TranslationTargetsProps {
  value: TranslationConfig
  onChange: (value: TranslationConfig) => void
}

/** Fills `targets` up to three with the first languages not already picked. */
function padTranslationTargets(targets: string[]): string[] {
  const padded = [...targets]
  for (const language of TARGET_LANGUAGES) {
    if (padded.length >= PILL_TRANSLATION_TARGETS) break
    if (!padded.includes(language.value)) padded.push(language.value)
  }
  return padded
}

/**
 * Three translation language slots, side by side. The radio dot marks the language used by
 * default; the pill shows these three as chips while recording in Translate. Slots 4 and 5 only
 * appear for configs that already have them, and can be removed down to three.
 */
export function TranslationTargets({ value, onChange }: TranslationTargetsProps) {
  const { t } = useTranslation()
  const padded = useRef(false)

  // Older configs may hold fewer than three targets: fill them once so three chips show.
  useEffect(() => {
    if (padded.current) return
    padded.current = true
    if (value.targets.length >= PILL_TRANSLATION_TARGETS) return
    const targets = padTranslationTargets(value.targets)
    const activeTarget = targets.includes(value.active_target) ? value.active_target : targets[0]
    onChange({ targets, active_target: activeTarget })
  }, [onChange, value])

  const selected = new Set(value.targets)
  const canRemove = value.targets.length > PILL_TRANSLATION_TARGETS

  const languageLabel = (code: string) => {
    const language = TARGET_LANGUAGES.find((item) => item.value === code)
    if (!language) return code
    return language.labelKey ? t(language.labelKey) : language.label
  }

  const updateTarget = (index: number, code: string) => {
    if (selected.has(code) && value.targets[index] !== code) return
    const previous = value.targets[index]
    const targets = [...value.targets]
    targets[index] = code
    onChange({
      targets,
      active_target: value.active_target === previous ? code : value.active_target,
    })
  }

  const removeTarget = (index: number) => {
    if (!canRemove) return
    const removed = value.targets[index]
    const targets = value.targets.filter((_, targetIndex) => targetIndex !== index)
    const activeTarget =
      removed === value.active_target
        ? targets[Math.min(index, targets.length - 1)]
        : value.active_target
    onChange({ targets, active_target: activeTarget })
  }

  return (
    <div className="space-y-2">
      <span className="block text-[13px] text-text-primary">{t('translate.targetsLabel')}</span>
      <div
        role="radiogroup"
        aria-label={t('translate.targetsLabel')}
        className="grid grid-cols-3 gap-2"
      >
        {value.targets.map((code, index) => (
          <div
            key={`${index}-${code}`}
            data-testid={`translation-target-${code}`}
            className="flex min-w-0 items-center gap-1.5"
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
            <select
              value={code}
              onChange={(event) => updateTarget(index, event.target.value)}
              aria-label={t('translate.slot', { number: index + 1 })}
              className="popup min-w-0 flex-1"
            >
              {TARGET_LANGUAGES.filter(
                (language) => language.value === code || !selected.has(language.value),
              ).map((language) => (
                <option key={language.value} value={language.value}>
                  {language.labelKey ? t(language.labelKey) : language.label}
                </option>
              ))}
            </select>
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
          </div>
        ))}
      </div>
      <p className="row-help">{t('translate.cycleHint')}</p>
    </div>
  )
}
