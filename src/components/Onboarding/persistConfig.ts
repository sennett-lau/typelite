import { useAppStore } from '../../stores/appStore'
import { updateConfig as saveConfig } from '../../lib/tauri'

/**
 * Save the whole config from the store to the backend right away. Onboarding saves each
 * choice immediately (not only on Next), because the shortcuts and the pipeline read the
 * saved config: a new shortcut only goes live once the backend has it.
 */
export async function persistConfig(): Promise<void> {
  await saveConfig(useAppStore.getState().config)
}
