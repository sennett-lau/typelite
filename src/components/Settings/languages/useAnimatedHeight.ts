import { useLayoutEffect, useRef } from 'react'

/** The sheet's height change: 0.28 s ease (plan `language-prompt-library`, from the mock). */
export const SHEET_HEIGHT_TRANSITION = 'height 0.28s ease'

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

/**
 * Animates an element's height whenever `contentKey` changes (tabs, on/off, browse, preview):
 * the element starts at its old height and eases to the new one, then goes back to `auto`.
 * With reduced motion the height changes at once.
 */
export function useAnimatedHeight<T extends HTMLElement>(contentKey: unknown) {
  const ref = useRef<T | null>(null)
  const lastHeight = useRef<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const previous = lastHeight.current
    element.style.transition = ''
    element.style.height = ''
    const next = element.getBoundingClientRect().height
    lastHeight.current = next
    if (previous === null || Math.abs(next - previous) < 2 || prefersReducedMotion()) return

    element.style.height = `${previous}px`
    element.style.overflow = 'hidden'
    // Read layout so the browser takes the old height before the transition starts.
    void element.getBoundingClientRect()
    element.style.transition = SHEET_HEIGHT_TRANSITION
    element.style.height = `${next}px`

    const clear = () => {
      element.style.height = ''
      element.style.transition = ''
      element.style.overflow = ''
    }
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element) clear()
    }
    element.addEventListener('transitionend', onEnd)
    const timer = window.setTimeout(clear, 400)
    return () => {
      element.removeEventListener('transitionend', onEnd)
      window.clearTimeout(timer)
    }
  }, [contentKey])

  return ref
}
