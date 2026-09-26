import { Fragment } from 'react'
import { KEY_SYMBOLS, keyParts } from '../../lib/keyLabels'

interface KeyCapProps {
  /** A key name as stored in a shortcut: `RightShift`, `End`, `K`. */
  name: string
  /** The cap's look: `kbd` (default), `kbd kbd-large`, `kbd kbd-inline`, `pill-nudge-key`… */
  className?: string
}

/**
 * Plan `compact-key-labels`: one key cap. Modifiers show their macOS symbol, with a small side
 * letter for a side-specific key (⇧ + small R). Hovering shows the full name, and screen
 * readers read the full name ("Right Shift") instead of the symbol.
 */
export function KeyCap({ name, className = 'kbd' }: KeyCapProps) {
  const { symbol, side, full } = keyParts(name)
  if (!side && symbol === full) {
    return (
      <kbd className={className} title={full}>
        {full}
      </kbd>
    )
  }
  return (
    <kbd className={className} title={full}>
      <span aria-hidden="true">
        <span className={KEY_SYMBOLS.has(symbol) ? 'kbd-glyph' : undefined}>{symbol}</span>
        {side && <span className="kbd-side">{side}</span>}
      </span>
      <span className="sr-only">{full}</span>
    </kbd>
  )
}

interface KeyCapsProps {
  /** Key names in display order (`bindingKeyNames(binding)`). */
  keys: string[]
  /** Passed to every cap. */
  className?: string
  /**
   * How caps are joined: nothing (the caller lays them out, for example with a flex gap), or
   * " + " as text between them (inside a sentence).
   */
  joiner?: 'none' | 'plus'
}

/** Several key caps in a row, for a binding or a group of keys in a sentence. */
export function KeyCaps({ keys, className, joiner = 'none' }: KeyCapsProps) {
  return (
    <>
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {joiner === 'plus' && index > 0 && ' + '}
          <KeyCap name={key} className={className} />
        </Fragment>
      ))}
    </>
  )
}
