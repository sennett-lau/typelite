import { useTranslation } from 'react-i18next'
import { MAX_TRANSLATION_TARGETS, targetLanguageLabel } from '../../lib/constants'
import { useAppStore } from '../../stores/appStore'

/** What the Translate recording pill shows (plan `translate-pill-and-keys`). */
export interface TranslatePill {
  /** The chosen languages, at most three. */
  codes: string[]
  /** Index of the active language in `codes` (0 when there is none). */
  activeIndex: number
  /** Display name of the active language; null when no language is chosen. */
  name: string | null
  /** One dot per language when there are two or three; 0 otherwise. */
  dots: number
}

/**
 * The pill's view of the translation languages: the active language's name, and one dot per
 * language when there is something to switch to. One language shows its name only; no language
 * shows no name.
 */
export function translatePillFor(
  targets: string[],
  activeTarget: string,
  languageName: (code: string) => string,
): TranslatePill {
  const codes = targets.slice(0, MAX_TRANSLATION_TARGETS)
  const found = codes.indexOf(activeTarget)
  const activeIndex = found === -1 ? 0 : found
  const code = codes[activeIndex]
  return {
    codes,
    activeIndex,
    name: code === undefined ? null : languageName(code),
    dots: codes.length >= 2 ? codes.length : 0,
  }
}

/** [`translatePillFor`] for the current config and UI language. */
export function useTranslatePill(): TranslatePill {
  const { t } = useTranslation()
  const targets = useAppStore((state) => state.config.translation.targets)
  const activeTarget = useAppStore((state) => state.config.translation.active_target)
  return translatePillFor(targets, activeTarget, (code) => targetLanguageLabel(code, t))
}
