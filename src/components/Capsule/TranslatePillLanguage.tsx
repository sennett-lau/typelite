import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import {
  NAME_MAX_WIDTH,
  marqueeDurationSeconds,
  nameDisplay,
  useTranslatePill,
} from './translatePill'

/**
 * The language part of a Translate recording pill (plan `translate-pill-and-keys`, option B):
 * the active language's name and, with two or three languages, one small dot per language
 * (the filled dot is the active one). One language shows its name only; none shows nothing.
 *
 * The name takes its natural width, up to 180 pt; the pill grows with it (see
 * `translateRecordingSize`). A wider name scrolls left as a continuous marquee (two copies,
 * 28 pt apart), or ends with an ellipsis when the user prefers reduced motion. A new name
 * fades in while the pill animates to its new width.
 */
export function TranslatePillLanguage() {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const pill = useTranslatePill()
  if (pill.name === null || pill.nameWidth === null) return null

  const display = nameDisplay(pill.nameWidth, reduced)
  const style: CSSProperties & Record<'--pill-marquee-duration', string> = {
    width: Math.min(Math.ceil(pill.nameWidth), NAME_MAX_WIDTH),
    '--pill-marquee-duration': `${marqueeDurationSeconds(pill.nameWidth).toFixed(2)}s`,
  }

  return (
    <>
      <span
        key={pill.name}
        className={`pill-lang-name ${display === 'marquee' ? 'pill-lang-marquee' : ''}`}
        style={style}
        title={pill.name}
        aria-label={t('translate.pillLanguage', { language: pill.name })}
        data-display={display}
        data-testid="translate-pill-name"
      >
        {display === 'marquee' ? (
          <span className="pill-lang-marquee-track" aria-hidden="true">
            <span>{pill.name}</span>
            <span>{pill.name}</span>
          </span>
        ) : (
          pill.name
        )}
      </span>
      {pill.dots > 0 && (
        <span
          className="pill-lang-dots"
          role="img"
          aria-label={t('translate.pillPosition', {
            index: pill.activeIndex + 1,
            count: pill.dots,
          })}
          data-testid="translate-pill-dots"
        >
          {pill.codes.map((code, index) => (
            <i key={code} className={index === pill.activeIndex ? 'pill-lang-dot-on' : undefined} />
          ))}
        </span>
      )}
    </>
  )
}
