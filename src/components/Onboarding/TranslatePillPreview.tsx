import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Widest the language name gets before it scrolls (plan `tutorial-one-page`). */
export const PILL_NAME_MAX_WIDTH = 180

/** Waveform bar heights of the static preview, in points. */
const BARS = [6, 11, 7, 14, 9, 12, 5, 10, 13, 7]

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

interface Props {
  /** Display names of the chosen languages, in slot order. */
  names: string[]
  /** Index of the active language in `names`. */
  active: number
  /** Clicking the name switches to the next language (two or more languages). */
  onSwitch: () => void
}

/**
 * Plan `tutorial-one-page`: a static copy of the Translate recording pill (the design of plan
 * `translate-pill-and-keys`) for the onboarding setup page. Dark glass with the aurora inside,
 * 40 pt tall: red dot, waveform, the active language name and one dot per language. The name
 * grows the pill up to 180 pt, then scrolls as a continuous marquee (an ellipsis with Reduce
 * Motion). The pill's width animates when the content changes.
 */
export function TranslatePillPreview({ names, active, onSwitch }: Props) {
  const { t } = useTranslation()
  const name = names[active] ?? ''
  const measureRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [nameWidth, setNameWidth] = useState(0)
  const [width, setWidth] = useState<number | null>(null)
  const marquee = nameWidth > PILL_NAME_MAX_WIDTH && !prefersReducedMotion()

  // Natural width of the name, measured by a hidden copy (0 in tests, where nothing lays out).
  useLayoutEffect(() => {
    setNameWidth(measureRef.current?.offsetWidth ?? 0)
  }, [name])

  // The pill takes its content's width; CSS animates the change.
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    const next = content.offsetWidth
    setWidth(next > 0 ? next + 2 : null)
  }, [name, names.length, marquee])

  const canSwitch = names.length >= 2

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
      <span ref={measureRef} className="pill-preview-measure" aria-hidden="true">
        {name}
      </span>
      <div ref={contentRef} className="pill-preview-content">
        <span className="pill-preview-rec" aria-hidden="true" />
        <span className="pill-preview-wave" aria-hidden="true">
          {BARS.map((height, index) => (
            <i key={index} style={{ height }} />
          ))}
        </span>
        {name && (
          <PillName
            name={name}
            // About 28 pt per second, as in the agreed mock.
            marqueeSeconds={marquee ? Math.max(5, (nameWidth + 28) / 28) : 0}
            canSwitch={canSwitch}
            onSwitch={onSwitch}
          />
        )}
        {canSwitch && (
          <span className="pill-preview-dots" aria-hidden="true">
            {names.map((_, index) => (
              <i key={index} data-active={index === active} />
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

function PillName({
  name,
  marqueeSeconds,
  canSwitch,
  onSwitch,
}: {
  name: string
  /** Seconds per marquee loop; 0 when the name fits (no marquee). */
  marqueeSeconds: number
  canSwitch: boolean
  onSwitch: () => void
}) {
  const { t } = useTranslation()
  const marquee = marqueeSeconds > 0
  const className = `pill-preview-name ${marquee ? 'pill-preview-name-marquee' : ''}`
  // Two copies side by side scroll by half their width: a seamless loop.
  const text = marquee ? (
    <span style={{ ['--marquee-duration' as string]: `${marqueeSeconds}s` }}>
      <span>{name}</span>
      <span aria-hidden="true">{name}</span>
    </span>
  ) : (
    name
  )
  if (!canSwitch) {
    return (
      <span className={className} title={name}>
        {text}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={className}
      title={t('onboarding.translate.switchTitle', { language: name })}
      onClick={onSwitch}
    >
      {text}
    </button>
  )
}
