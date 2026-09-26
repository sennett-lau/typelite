import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from 'framer-motion'
import { cycleTranslationTarget } from '../../lib/tauri'
import { useAppStore } from '../../stores/appStore'
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
 *
 * With two or three languages the name is a button: a click moves the running recording to the
 * next language, exactly like the Switch language key, without stopping it. The pill window
 * never takes focus, so the frontmost app keeps it.
 */
export function TranslatePillLanguage() {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false
  const pill = useTranslatePill()
  const applyPersistedConfigPatch = useAppStore((state) => state.applyPersistedConfigPatch)
  const [pending, setPending] = useState(false)
  if (pill.name === null || pill.nameWidth === null) return null

  const display = nameDisplay(pill.nameWidth, reduced)
  const style: CSSProperties & Record<'--pill-marquee-duration', string> = {
    width: Math.min(Math.ceil(pill.nameWidth), NAME_MAX_WIDTH),
    '--pill-marquee-duration': `${marqueeDurationSeconds(pill.nameWidth).toFixed(2)}s`,
  }
  const className = `pill-lang-name ${display === 'marquee' ? 'pill-lang-marquee' : ''}`
  const label = t('translate.pillLanguage', { language: pill.name })
  const content =
    display === 'marquee' ? (
      <span className="pill-lang-marquee-track" aria-hidden="true">
        <span>{pill.name}</span>
        <span>{pill.name}</span>
      </span>
    ) : (
      pill.name
    )

  const switchLanguage = async () => {
    if (pending) return
    setPending(true)
    try {
      const translation = await cycleTranslationTarget()
      applyPersistedConfigPatch({ target_lang: translation.active_target, translation })
    } catch (error) {
      console.error('Failed to switch translation language:', error)
    } finally {
      setPending(false)
    }
  }

  // A click on the pill itself stops the recording, so the name's pointer events stay here.
  const stopPointerPropagation = (event: React.PointerEvent) => event.stopPropagation()

  return (
    <>
      {pill.dots > 0 ? (
        <button
          key={pill.name}
          type="button"
          className={`${className} pill-lang-switch`}
          style={style}
          title={`${pill.name} · ${t('translate.pillSwitchHint')}`}
          aria-label={`${label}. ${t('translate.pillSwitchHint')}`}
          data-display={display}
          data-testid="translate-pill-name"
          onPointerDown={stopPointerPropagation}
          onPointerUp={stopPointerPropagation}
          // Keep the button from taking keyboard focus inside the pill.
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            void switchLanguage()
          }}
        >
          {content}
        </button>
      ) : (
        <span
          key={pill.name}
          className={className}
          style={style}
          title={pill.name}
          aria-label={label}
          data-display={display}
          data-testid="translate-pill-name"
        >
          {content}
        </span>
      )}
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
