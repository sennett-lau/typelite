import { useEffect } from 'react'
import { startSpeechSetup } from '../lib/tauri'
import { DEFAULT_SETUP_MODEL } from '../lib/speechSetup'
import { useSpeechSetupStore } from '../stores/speechSetupStore'
import type { ModelSetupStoreHook } from '../stores/modelSetupStore'

/** Starts a Quick speech setup; an error to start (one already running) is only logged. */
export function beginSpeechSetup(modelId: string = DEFAULT_SETUP_MODEL) {
  startSpeechSetup(modelId).catch((error) => console.error('[speech setup] start failed', error))
}

/** Loads the backend's current setup status once, so a window opened mid-download shows it. */
export function useSetupStatus(store: ModelSetupStoreHook) {
  const status = store((s) => s.status)
  const refresh = store((s) => s.refresh)
  useEffect(() => {
    void refresh()
  }, [refresh])
  return status
}

/**
 * Plan `two-tab-speech`: reads the chip, memory and free disk space when a setup screen opens, and
 * returns the result (null until it arrives).
 */
export function useSetupHardware(store: ModelSetupStoreHook) {
  const hardware = store((s) => s.hardware)
  const refreshHardware = store((s) => s.refreshHardware)
  useEffect(() => {
    void refreshHardware()
  }, [refreshHardware])
  return hardware
}

export function useSpeechSetupStatus() {
  return useSetupStatus(useSpeechSetupStore)
}

export function useSpeechHardware() {
  return useSetupHardware(useSpeechSetupStore)
}
