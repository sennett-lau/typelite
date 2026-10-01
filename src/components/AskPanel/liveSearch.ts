import type { AskPanelLimits, LiveSearchState } from '../../lib/tauri'

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

/** The panel's width for a short answer, in points (`PANEL_WIDTH` in ask_panel.rs). */
export const PANEL_WIDTH = 420
/** Plan `ask-web-search`: the sources column's width when it is open. */
export const SOURCES_COLUMN_WIDTH = 288
/** Before the app has sent the limits (and in tests): a modest cap. */
export const FALLBACK_LIMITS: AskPanelLimits = {
  maxWidth: PANEL_WIDTH + SOURCES_COLUMN_WIDTH,
  maxHeight: 440,
}
/** An answer longer than this (or with this many lines) widens the panel to its limit. */
const LONG_ANSWER_CHARS = 360
const LONG_ANSWER_LINES = 5

/** Plan `ask-web-search`: long answers get the wide panel; short ones keep 420 pt. */
export function isLongAnswer(text: string): boolean {
  return text.length > LONG_ANSWER_CHARS || text.split('\n').length >= LONG_ANSWER_LINES
}

/** The panel's width: 420 pt (plus the open sources column), or the limit for a long answer. */
export function panelWidth(long: boolean, sourcesOpen: boolean, limits: AskPanelLimits): number {
  const wanted = long ? limits.maxWidth : PANEL_WIDTH + (sourcesOpen ? SOURCES_COLUMN_WIDTH : 0)
  return Math.min(wanted, limits.maxWidth)
}
