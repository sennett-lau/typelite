import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import { measurePillNameWidth } from '../../lib/textWidth'
import { NAME_MAX_WIDTH, marqueeDurationSeconds, nameDisplay } from '../Capsule/translatePill'

/** Waveform bar heights of the static preview, in points. */
const BARS = [5, 9, 6, 11, 7, 10, 4, 8, 10, 6]

interface Props {
  /** Display names of the chosen languages, in slot order. */
  names: string[]
  /** Index of the active language in `names`. */
  active: number
  /** Clicking the name switches to the next language (two or more languages). */
  onSwitch: () => void
}

/**
 * Plan `tutorial-one-page`: a static copy of the Translate recording pill of plan
 * `translate-pill-and-keys`, for the onboarding setup page. Dark glass with the aurora inside,
 * 32 pt tall: red dot, waveform, the active language name and one dot per language. The name
 * uses the real pill's classes and rules: it grows the pill up to 180 pt, then scrolls as a
 * marquee (an ellipsis with Reduce Motion). The preview's width animates when the content
 * changes. Nothing here touches the real pill or a recording.
 */
export function TranslatePillPreview({ names, active, onSwitch }: Props) {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const name = names[active] ?? ''
  const contentRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)

  // The pill takes its content's width; CSS animates the change (0 in tests: no layout).
  useLayoutEffect(() => {
    const next = contentRef.current?.offsetWidth ?? 0
    setWidth(next > 0 ? next + 2 : null)
  }, [name, names.length, reduced])

  return (
    <div
      className="pill-preview"
      style={width ? { width } : undefined}
      role="group"
      aria-label={
        name
          ? t('onboarding.translate.previewWithLanguage', { language: name })
          : t('onboarding.translate.preview')
      }
    >
      <div ref={contentRef} className="pill-preview-content">
        <span className="pill-preview-rec" aria-hidden="true" />
        <span className="pill-preview-wave" aria-hidden="true">
          {BARS.map((height, index) => (
            <i key={index} style={{ height }} />
          ))}
        </span>
        {name && (
          <PreviewName
            key={name}
            name={name}
            reduced={reduced}
            canSwitch={names.length >= 2}
            onSwitch={onSwitch}
          />
        )}
        {names.length >= 2 && (
          <span className="pill-lang-dots" aria-hidden="true">
            {names.map((language, index) => (
              <i key={language} className={index === active ? 'pill-lang-dot-on' : undefined} />
            ))}
          </span>
        )}
        <span className="pill-preview-close" aria-hidden="true">
          ✕
        </span>
      </div>
    </div>
  )
}

function PreviewName({
  name,
  reduced,
  canSwitch,
  onSwitch,
}: {
  name: string
  reduced: boolean
  canSwitch: boolean
  onSwitch: () => void
}) {
  const { t } = useTranslation()
  const natural = measurePillNameWidth(name)
  const display = nameDisplay(natural, reduced)
  const style: CSSProperties & Record<'--pill-marquee-duration', string> = {
    width: Math.min(Math.ceil(natural), NAME_MAX_WIDTH),
    '--pill-marquee-duration': `${marqueeDurationSeconds(natural).toFixed(2)}s`,
  }
  const className = `pill-lang-name ${display === 'marquee' ? 'pill-lang-marquee' : ''}`
  // Two copies side by side scroll by half their width: a seamless loop.
  const content =
    display === 'marquee' ? (
      <span className="pill-lang-marquee-track" aria-hidden="true">
        <span>{name}</span>
        <span>{name}</span>
      </span>
    ) : (
      name
    )
  if (!canSwitch) {
    return (
      <span className={className} style={style} title={name} data-display={display}>
        {content}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`${className} pill-lang-switch`}
      style={style}
      title={t('onboarding.translate.switchTitle', { language: name })}
      aria-label={name}
      data-display={display}
      onClick={onSwitch}
    >
      {content}
    </button>
  )
}
