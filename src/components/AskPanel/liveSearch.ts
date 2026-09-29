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
