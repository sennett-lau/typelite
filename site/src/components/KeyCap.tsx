/**
 * A key cap drawn like the app's (src/components/ui/KeyCap.tsx): modifiers show their macOS
 * symbol, a side-specific key adds a small side letter (⇧ + L), and screen readers get the full
 * name.
 */
const KEYS: Record<string, { symbol: string; side?: string; full: string }> = {
  Fn: { symbol: 'Fn', full: 'Fn' },
  Space: { symbol: 'Space', full: 'Space' },
  Shift: { symbol: '⇧', full: 'Shift' },
  LeftShift: { symbol: '⇧', side: 'L', full: 'Left Shift' },
  RightShift: { symbol: '⇧', side: 'R', full: 'Right Shift' },
  Escape: { symbol: 'esc', full: 'Escape' },
}

export function KeyCap({
  name,
  large = false,
  down = false,
}: {
  name: string
  large?: boolean
  down?: boolean
}) {
  const key = KEYS[name] ?? { symbol: name, full: name }
  const className = `kbd ${large ? 'kbd-lg' : ''} ${down ? 'is-down' : ''}`
  if (key.symbol === key.full) {
    return (
      <kbd className={className} title={key.full}>
        {key.full}
      </kbd>
    )
  }
  return (
    <kbd className={className} title={key.full}>
      <span aria-hidden="true">
        <span className="kbd-glyph">{key.symbol}</span>
        {key.side && <span className="kbd-side">{key.side}</span>}
      </span>
      <span className="sr-only">{key.full}</span>
    </kbd>
  )
}
