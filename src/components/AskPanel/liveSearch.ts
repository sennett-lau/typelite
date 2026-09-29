import type { LiveSearchState } from '../../lib/tauri'

/** Plan `ask-web-search`: the live-question body text for why the web was not used. */
export function liveBodyKey(liveSearch: LiveSearchState | null | undefined): string {
  switch (liveSearch) {
    case 'failed':
      return 'ask.liveBodySearchFailed'
    case 'noResults':
      return 'ask.liveBodyNoResults'
    default:
      return 'ask.liveBody'
  }
}

/**
 * Plan `ask-web-search`: splits an answer into text and citation numbers. `[2]`, `[1][3]` and
 * `[1, 4]` become numbers when a source has that number; anything else stays text.
 */
export function answerSegments(text: string, numbers: number[]): (string | number)[] {
  const known = new Set(numbers)
  const segments: (string | number)[] = []
  let rest = ''
  let last = 0
  for (const match of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    const cited = match[1].split(',').map((part) => Number(part.trim()))
    if (!cited.every((n) => known.has(n))) continue
    rest += text.slice(last, match.index)
    if (rest) segments.push(rest)
    rest = ''
    segments.push(...cited)
    last = (match.index ?? 0) + match[0].length
  }
  rest += text.slice(last)
  if (rest) segments.push(rest)
  return segments
}
