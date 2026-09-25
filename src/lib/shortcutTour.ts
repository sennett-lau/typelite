import { useAppStore } from '../stores/appStore'
import { setShortcutTourState } from './tauri'
import { isAiReady, isSpeechReady } from './readiness'

/**
 * The shortcut tour (onboarding's Dictate, Translate and Ask steps) after a skipped setup:
 * offered once both services work, until it is finished (plan 0007).
 */

/** Both services work and the shortcut tour is not done yet. */
export function useShortcutTourAvailable(): boolean {
  return useAppStore(
    (s) => isSpeechReady(s.config) && isAiReady(s.config) && !s.config.shortcut_tour_completed,
  )
}

/** Saves "the prompt was answered" and mirrors it into the store. */
export function dismissShortcutTourPrompt() {
  useAppStore.getState().applyPersistedConfigPatch({ shortcut_tour_prompt_dismissed: true })
  setShortcutTourState({ promptDismissed: true }).catch((error) =>
    console.error('[tour] failed to save the dismissed prompt', error),
  )
}

/** Opens onboarding at the Dictate step, keeping every earlier choice. */
export function startShortcutTour() {
  useAppStore.getState().startShortcutTour()
}
