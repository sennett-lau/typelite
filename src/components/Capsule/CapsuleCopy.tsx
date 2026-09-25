import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { useAppStore, type CopyOffer } from '../../stores/appStore'
import { copyOfferToClipboard, dismissCopyOffer } from '../../lib/tauri'
import { useCountdown } from '../../hooks/useCountdown'
import { TARGET_LANGUAGE_SHORT_LABELS, targetLanguageLabel } from '../../lib/constants'

/** How long the Copy pill stays when nobody hovers or clicks it. */
export const COPY_PILL_HOLD_MS = 8000
/** How long "Copied" shows before the pill hides. */
export const COPIED_HIDE_MS = 1000

/** Fallback size of the Copy button before it is measured. */
const BUTTON_FALLBACK = { width: 66, height: 26 }

interface CapsuleCopyProps {
  offer: CopyOffer
  /** False while the pill hides; the countdown then stops. */
  active: boolean
}

/**
 * The Copy pill (plan `copy-when-no-field`): the result was not pasted because no text field had
 * focus. One
 * line: the target language for a translation, the start of the result, and a Copy button
 * whose border drains as an 8 s countdown. Hovering the pill pauses it; Escape closes it (the
 * native key listener, see `hotkey.rs`); Copy puts the full result on the clipboard, shows
 * "Copied" and hides the pill a moment later. The pill window never takes focus, so clicking
 * leaves the frontmost app focused.
 */
export function CapsuleCopy({ offer, active }: CapsuleCopyProps) {
  const { t } = useTranslation()
  const setCopyOffer = useAppStore((s) => s.setCopyOffer)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [button, setButton] = useState(BUTTON_FALLBACK)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const ringRef = useRef<SVGRectElement>(null)

  const close = useCallback(() => {
    // Only close the offer this pill shows; a newer one may have arrived.
    if (useAppStore.getState().copyOffer !== offer) return
    setCopyOffer(null)
    dismissCopyOffer().catch((error) => console.error('Failed to close the Copy pill:', error))
  }, [offer, setCopyOffer])

  const countdown = useCountdown(COPY_PILL_HOLD_MS, active && !hovered && !copied, close, offer)

  // Draw the draining border. Reads the countdown each frame without re-rendering.
  useEffect(() => {
    if (copied) return
    let raf = 0
    const frame = () => {
      ringRef.current?.setAttribute('stroke-dashoffset', String(100 - countdown.progress() * 100))
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [copied, countdown])

  useLayoutEffect(() => {
    const element = buttonRef.current
    if (!element || element.offsetWidth === 0) return
    setButton({ width: element.offsetWidth, height: element.offsetHeight })
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(close, COPIED_HIDE_MS)
    return () => clearTimeout(timer)
  }, [copied, close])

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (copied) return
    try {
      await copyOfferToClipboard()
      setCopied(true)
    } catch (error) {
      console.error('Failed to copy the result:', error)
      close()
    }
  }

  const stopPointerPropagation = (event: React.PointerEvent) => event.stopPropagation()
  const preview = offer.text.replace(/\s+/g, ' ').trim()
  const lang = offer.targetLang
  const radius = button.height / 2

  return (
    <div
      className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-3.5 pr-[5px]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      data-testid="capsule-copy"
    >
      {lang && (
        <span className="pill-lang" title={targetLanguageLabel(lang, t)}>
          {TARGET_LANGUAGE_SHORT_LABELS[lang] ?? lang.slice(0, 2).toUpperCase()}
        </span>
      )}
      <p className="min-w-0 flex-1 truncate text-[11px] font-medium leading-4 text-white/90">
        {preview}
      </p>
      <button
        ref={buttonRef}
        type="button"
        className={`pill-copy-button ${copied ? 'pill-copy-button-done' : ''}`}
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={handleCopy}
        aria-label={copied ? t('capsule.copied') : t('capsule.copyResult')}
        title={copied ? undefined : t('capsule.copyHint')}
      >
        {!copied && (
          <svg className="pill-copy-ring" aria-hidden="true">
            <rect
              className="pill-copy-ring-track"
              x="0.8"
              y="0.8"
              width={Math.max(0, button.width - 1.6)}
              height={Math.max(0, button.height - 1.6)}
              rx={radius}
            />
            <rect
              ref={ringRef}
              data-testid="capsule-copy-countdown"
              x="0.8"
              y="0.8"
              width={Math.max(0, button.width - 1.6)}
              height={Math.max(0, button.height - 1.6)}
              rx={radius}
              pathLength={100}
              strokeDasharray="100"
              strokeDashoffset="0"
            />
          </svg>
        )}
        <span key={copied ? 'copied' : 'copy'} className="pill-copy-label">
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? t('capsule.copied') : t('capsule.copy')}
        </span>
      </button>
    </div>
  )
}
