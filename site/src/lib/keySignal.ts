import { useEffect, useSyncExternalStore } from 'react'

/**
 * A tiny shared "is the shortcut down?" flag, so a feature's key caps (in its text column)
 * press at the moment its demo presses them. The demo writes it only when it changes, from an
 * effect, so the key caps re-render a few times per loop, not every frame.
 */
export interface KeySignal {
  get: () => boolean
  set: (down: boolean) => void
  subscribe: (fn: () => void) => () => void
}

export function createKeySignal(): KeySignal {
  let down = false
  const listeners = new Set<() => void>()
  return {
    get: () => down,
    set(next) {
      if (next === down) return
      down = next
      listeners.forEach((fn) => fn())
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
  }
}

export function useKeySignal(signal: KeySignal | undefined): boolean {
  return useSyncExternalStore(
    signal?.subscribe ?? noopSubscribe,
    signal?.get ?? falseValue,
    falseValue,
  )
}

/** Renders nothing; publishes `down` to the signal after each commit. */
export function KeySync({ signal, down }: { signal?: KeySignal; down: boolean }) {
  useEffect(() => {
    signal?.set(down)
  }, [signal, down])
  return null
}

const noopSubscribe = () => () => {}
const falseValue = () => false
