/**
 * Plan `compact-key-labels`: how one key name (as stored in a shortcut, for example
 * `RightShift`) is drawn. Modifiers use the macOS menu symbols ⌃ ⌥ ⇧ ⌘; a side-specific key
 * adds a side letter (`⇧` + `R`). The full name is for tooltips and screen readers.
 */

export type KeySide = 'L' | 'R'

export interface KeyParts {
  /** What the key cap shows: a symbol (`⇧`) or a short word (`End`). */
  symbol: string
  /** The side letter drawn small after the symbol, for side-specific keys only. */
  side?: KeySide
  /** The full English name: `Right Shift`, `Return`, `End`. */
  full: string
}

const MODIFIERS: Record<string, { symbol: string; name: string }> = {
  Control: { symbol: '⌃', name: 'Control' },
  Option: { symbol: '⌥', name: 'Option' },
  Shift: { symbol: '⇧', name: 'Shift' },
  Command: { symbol: '⌘', name: 'Command' },
}

/** Key names that map to one modifier on either side (no side letter). */
const GENERIC: Record<string, string> = {
  Ctrl: 'Control',
  Control: 'Control',
  Option: 'Option',
  Alt: 'Option',
  Shift: 'Shift',
  Command: 'Command',
  Super: 'Command',
  Meta: 'Command',
}

/** Other keys with a symbol or a different name. Anything not listed is shown as it is. */
const SPECIAL: Record<string, { symbol: string; full: string }> = {
  Enter: { symbol: '↩', full: 'Return' },
  // The Mac "delete" key is Backspace; Forward Delete is the Delete key name.
  Backspace: { symbol: '⌫', full: 'Delete' },
  Delete: { symbol: '⌦', full: 'Forward Delete' },
  Tab: { symbol: '⇥', full: 'Tab' },
  Escape: { symbol: 'esc', full: 'Escape' },
  Left: { symbol: '←', full: 'Left Arrow' },
  Right: { symbol: '→', full: 'Right Arrow' },
  Up: { symbol: '↑', full: 'Up Arrow' },
  Down: { symbol: '↓', full: 'Down Arrow' },
  PageUp: { symbol: 'Page Up', full: 'Page Up' },
  PageDown: { symbol: 'Page Down', full: 'Page Down' },
}

/** Symbols drawn a little larger than words in a key cap, so ⌃ reads as well as "End". */
export const KEY_SYMBOLS = new Set(['⌃', '⌥', '⇧', '⌘', '↩', '⌫', '⌦', '⇥', '←', '→', '↑', '↓'])

export function keyParts(name: string): KeyParts {
  const generic = GENERIC[name]
  if (generic) {
    const { symbol, name: full } = MODIFIERS[generic]
    return { symbol, full }
  }
  if (name === 'RightAlt') return { symbol: '⌥', side: 'R', full: 'Right Alt' }
  const sided = /^(Left|Right)(Control|Option|Shift|Command)$/.exec(name)
  if (sided) {
    const [, sideWord, modifier] = sided
    return {
      symbol: MODIFIERS[modifier].symbol,
      side: sideWord === 'Left' ? 'L' : 'R',
      full: `${sideWord} ${MODIFIERS[modifier].name}`,
    }
  }
  const special = SPECIAL[name]
  if (special) return { ...special }
  return { symbol: name, full: name }
}

/** The key as short plain text, with the side as a plain letter: `⇧R`, `End`. */
export function compactKeyLabel(name: string): string {
  const { symbol, side } = keyParts(name)
  return side ? `${symbol}${side}` : symbol
}

/** The key's full name: `Right Shift`. */
export function fullKeyLabel(name: string): string {
  return keyParts(name).full
}
