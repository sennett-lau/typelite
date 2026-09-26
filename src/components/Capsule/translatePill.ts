import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_TRANSLATION_TARGETS, targetLanguageLabel } from '../../lib/constants'
import { measurePillNameWidth } from '../../lib/textWidth'
import { useAppStore } from '../../stores/appStore'

/**
 * The language name grows the pill up to this width; a wider name scrolls (plan
 * `translate-pill-and-keys`).
 */
export const NAME_MAX_WIDTH = 180
/** Space between the two copies of a scrolling name. */
export const MARQUEE_GAP = 28
/** Marquee speed in points per second. */
export const MARQUEE_SPEED = 28

/** What the Translate recording pill shows (plan `translate-pill-and-keys`). */
export interface TranslatePill {
  /** The chosen languages, at most three. */
  codes: string[]
  /** Index of the active language in `codes` (0 when there is none). */
  activeIndex: number
  /** Display name of the active language; null when no language is chosen. */
  name: string | null
  /** Natural width of `name` in the pill's font; null when there is no name. */
  nameWidth: number | null
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
  measure: (text: string) => number = measurePillNameWidth,
): TranslatePill {
  const codes = targets.slice(0, MAX_TRANSLATION_TARGETS)
  const found = codes.indexOf(activeTarget)
  const activeIndex = found === -1 ? 0 : found
  const code = codes[activeIndex]
  const name = code === undefined ? null : languageName(code)
  return {
    codes,
    activeIndex,
    name,
    nameWidth: name === null ? null : measure(name),
    dots: codes.length >= 2 ? codes.length : 0,
  }
}

/** How the name is drawn: in full, as a scrolling marquee, or cut with an ellipsis. */
export type NameDisplay = 'full' | 'marquee' | 'ellipsis'

/**
 * Decided by the name's natural width against the fixed limit, never by the pill's width at
 * the moment (it animates). With Reduce Motion a long name is cut instead of scrolling.
 */
export function nameDisplay(naturalWidth: number, reducedMotion: boolean): NameDisplay {
  if (naturalWidth <= NAME_MAX_WIDTH) return 'full'
  return reducedMotion ? 'ellipsis' : 'marquee'
}

/** One marquee loop moves one copy of the name plus the gap, at `MARQUEE_SPEED`. */
export function marqueeDurationSeconds(naturalWidth: number): number {
  return (Math.ceil(naturalWidth) + MARQUEE_GAP) / MARQUEE_SPEED
}

/** [`translatePillFor`] for the current config and UI language. */
export function useTranslatePill(): TranslatePill {
  const { t } = useTranslation()
  const targets = useAppStore((state) => state.config.translation.targets)
  const activeTarget = useAppStore((state) => state.config.translation.active_target)
  return useMemo(
    () => translatePillFor(targets, activeTarget, (code) => targetLanguageLabel(code, t)),
    [targets, activeTarget, t],
  )
}
