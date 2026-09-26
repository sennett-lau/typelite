import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, X } from 'lucide-react'
import { displayBinding, useAppStore } from '../../stores/appStore'
import { dismissTypingNudge } from '../../lib/tauri'
import { useCountdown } from '../../hooks/useCountdown'

const KEY_MARKER = '@@KEY@@'

/** How long the typing nudge stays when nobody hovers it. */
export const NUDGE_HOLD_MS = 8000

/** The first Dictate shortcut as the user reads it ("End", "Fn"), or null when none is set. */
function useDictateKeyLabel(): string | null {
  const binding = useAppStore((s) => s.config.hotkeys?.dictationBindings?.[0] ?? null)
  return binding ? displayBinding(binding) : null
}

/**
 * Plan `typing-speed-and-nudge`: the typing nudge. After a long stretch of typing in another app
 * the pill suggests the Dictate shortcut: "Typing a lot? Press End to say it instead." with
 * "Don't show again" and ✕. It hides by itself after 8 s (hovering pauses the countdown). The
 * pill window never takes focus, so clicking leaves the frontmost app focused.
 */
export function CapsuleNudge({ active }: { active: boolean }) {
  const { t } = useTranslation()
  const setTypingNudge = useAppStore((s) => s.setTypingNudge)
  const dictateKey = useDictateKeyLabel()
  const [hovered, setHovered] = useState(false)

  const close = useCallback(
    (forever: boolean) => {
      if (!useAppStore.getState().typingNudge) return
      setTypingNudge(false)
      dismissTypingNudge(forever).catch((error) =>
        console.error('Failed to close the typing nudge:', error),
      )
    },
    [setTypingNudge],
  )

  useCountdown(NUDGE_HOLD_MS, active && !hovered, () => close(false))

  const stopPointerPropagation = (event: React.PointerEvent) => event.stopPropagation()
  // The key goes in its own <kbd>, so the sentence is split around a marker.
  const [before = '', after = ''] = t('capsule.nudge.text', { key: KEY_MARKER }).split(KEY_MARKER)

  return (
    <div
      className="relative z-10 flex h-full min-w-0 items-center gap-2 pl-3.5 pr-[7px]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      role="status"
      data-testid="capsule-nudge"
    >
      <Mic size={14} className="flex-none text-white/85" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-[12px] font-medium leading-4 text-white/95">
        {before}
        <kbd className="pill-nudge-key">{dictateKey ?? ''}</kbd>
        {after}
      </p>
      <button
        type="button"
        className="pill-nudge-link"
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={(event) => {
          event.stopPropagation()
          close(true)
        }}
      >
        {t('capsule.nudge.dontShowAgain')}
      </button>
      <button
        type="button"
        className="pill-nudge-close"
        aria-label={t('capsule.nudge.close')}
        onPointerDown={stopPointerPropagation}
        onPointerUp={stopPointerPropagation}
        onClick={(event) => {
          event.stopPropagation()
          close(false)
        }}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  )
}
