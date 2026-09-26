import { useEffect, useRef } from 'react'

/**
 * The hero's moving aurora: three soft gradient blobs drifting behind the headline (CSS
 * keyframes on transform only), and on desktop a faint glow that follows the pointer. The
 * blobs pause while the hero is off screen; with reduced motion both stay still. Decorative.
 */
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  // Pause the drifting blobs (and the headline gradient) while the hero is off screen.
  useEffect(() => {
    const el = ref.current
    const hero = el?.parentElement
    if (!el || !hero || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) =>
      hero.classList.toggle('is-offscreen', !entry.isIntersecting),
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Pointer glow: eases towards the pointer in a requestAnimationFrame loop that stops once it
  // has caught up, so nothing runs while the pointer rests.
  useEffect(() => {
    const glow = glowRef.current
    const backdrop = ref.current
    const hero = backdrop?.parentElement
    if (!glow || !backdrop || !hero) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!fine.matches || reduced.matches) return

    let x = 0
    let y = 0
    let tx = 0
    let ty = 0
    let raf = 0
    let placed = false
    const tick = () => {
      x += (tx - x) * 0.14
      y += (ty - y) * 0.14
      glow.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0
    }
    const onMove = (e: PointerEvent) => {
      const r = backdrop.getBoundingClientRect()
      tx = e.clientX - r.left
      ty = e.clientY - r.top
      if (!placed) {
        x = tx
        y = ty
        placed = true
      }
      glow.classList.add('on')
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const onLeave = () => glow.classList.remove('on')
    hero.addEventListener('pointermove', onMove, { passive: true })
    hero.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      hero.removeEventListener('pointermove', onMove)
      hero.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div ref={ref} className="hero-backdrop" aria-hidden="true">
      <div className="hero-blob hero-blob-a" />
      <div className="hero-blob hero-blob-b" />
      <div className="hero-blob hero-blob-c" />
      <div ref={glowRef} className="hero-glow" />
    </div>
  )
}
