import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'

/**
 * Every demo on the page is a pure function of a time `t` (seconds). On the site a
 * requestAnimationFrame loop advances `t` while the demo is on screen; the media capture
 * script (scripts/capture-media.mjs) instead sets `t` frame by frame through
 * `window.__typeliteCapture.setTime`, so GIF frames are exact and repeatable.
 */

type Listener = () => void

const capture = {
  enabled: false,
  time: 0,
  listeners: new Set<Listener>(),
}

declare global {
  interface Window {
    __typeliteCapture?: { setTime: (t: number) => Promise<void> }
  }
}

/** Turns on capture mode: demos stop their own clocks and follow `setTime`. */
export function enableCaptureClock() {
  capture.enabled = true
  window.__typeliteCapture = {
    setTime(t: number) {
      capture.time = t
      capture.listeners.forEach((fn) => fn())
      // Resolve after React has painted the new frame.
      return new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      )
    },
  }
}

/** True on the capture page (scripts/capture-media.mjs), where demos hide their controls. */
export function isCapture(): boolean {
  return capture.enabled
}

function subscribeCapture(fn: Listener) {
  capture.listeners.add(fn)
  return () => capture.listeners.delete(fn)
}

/** True when the user asked the system to reduce motion. False on the server. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return reduced
}

/** True while the element is at least partly on screen. */
export function useInView(ref: RefObject<Element | null>, margin = '0px'): boolean {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin: margin,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, margin])
  return inView
}

export interface Clock {
  /** Seconds into the loop. */
  t: number
  /** True while the loop runs (false when paused, off screen or with reduced motion). */
  running: boolean
  paused: boolean
  setPaused: (paused: boolean) => void
  reduced: boolean
}

/**
 * A looping clock for one demo. `restAt` is the frame shown before the demo starts, on the
 * server (the pre-rendered HTML), with reduced motion, and while it is off screen at first.
 */
export function useLoopClock(
  ref: RefObject<Element | null>,
  duration: number,
  restAt: number,
): Clock {
  const reduced = useReducedMotion()
  const inView = useInView(ref, '80px')
  const [paused, setPaused] = useState(false)
  const [t, setT] = useState(restAt)
  const started = useRef(false)
  const offset = useRef(0)
  const captureTime = useSyncExternalStore(
    subscribeCapture,
    () => capture.time,
    () => 0,
  )

  const running = !capture.enabled && !reduced && inView && !paused

  useEffect(() => {
    if (!running) return
    let raf = 0
    let last: number | null = null
    // The first time a demo comes into view it starts from 0, so it plays from the beginning.
    if (!started.current) {
      started.current = true
      offset.current = 0
    }
    const frame = (now: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000)
      last = now
      offset.current = (offset.current + dt) % duration
      setT(offset.current)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [running, duration])

  useEffect(() => {
    if (reduced) setT(restAt)
  }, [reduced, restAt])

  return {
    t: capture.enabled ? captureTime % duration : t,
    running,
    paused,
    setPaused,
    reduced,
  }
}

/** 0 before `a`, 1 after `b`, linear in between. */
export function progress(t: number, a: number, b: number): number {
  if (t <= a) return 0
  if (t >= b) return 1
  return (t - a) / (b - a)
}

/** Cubic ease out. */
export function easeOut(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

/** Cubic ease in-out. */
export function easeInOut(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/**
 * A believable voice level (0..1) at time `t` while someone speaks: syllable-rate bumps
 * with small pauses between words. Deterministic, so captures repeat exactly.
 */
export function voiceLevel(t: number, seed = 1): number {
  const syllable = Math.pow(Math.max(0, Math.sin(t * 29 + seed)), 0.7)
  const word = 0.5 + 0.5 * Math.sin(t * 6.3 + seed * 2.3)
  const breath = 0.7 + 0.3 * Math.sin(t * 1.3 + seed * 0.7)
  const jitter = 0.85 + 0.15 * Math.sin(t * 53.3 + seed * 5.1)
  return Math.min(1, 0.08 + 0.95 * Math.sqrt(syllable * (0.35 + 0.65 * word) * breath * jitter))
}
