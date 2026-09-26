/**
 * Width of a language name in the Translate pill's own font (`.pill-lang-name`: 12 pt, medium),
 * in CSS pixels, which are logical points in the pill window. Plan `translate-pill-and-keys`:
 * the same number sizes the pill and its native window, so the two always agree.
 */
const measured = new Map<string, number>()

/** Rough width when there is no layout engine (tests): CJK characters are about 12 pt wide. */
function estimateWidth(text: string): number {
  let width = 0
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 12 : 6.8
  return width
}

export function measurePillNameWidth(text: string): number {
  const cached = measured.get(text)
  if (cached !== undefined) return cached
  let width = 0
  if (typeof document !== 'undefined' && document.body) {
    // An invisible copy styled like the real name, without its 180 pt limit.
    const probe = document.createElement('span')
    probe.className = 'pill-lang-name pill-lang-name-probe'
    probe.textContent = text
    document.body.appendChild(probe)
    width = probe.getBoundingClientRect().width
    probe.remove()
  }
  if (width > 0) {
    measured.set(text, width)
    return width
  }
  return estimateWidth(text)
}
