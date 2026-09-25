import { useEffect } from 'react'
import { startSpeechSetup } from '../lib/tauri'
import { DEFAULT_SETUP_MODEL } from '../lib/speechSetup'
import { useSpeechSetupStore } from '../stores/speechSetupStore'

/** Starts a Quick speech setup; an error to start (one already running) is only logged. */
export function beginSpeechSetup(modelId: string = DEFAULT_SETUP_MODEL) {
  startSpeechSetup(modelId).catch((error) => console.error('[speech setup] start failed', error))
}

/** Loads the backend's current setup status once, so a window opened mid-download shows it. */
export function useSpeechSetupStatus() {
  const status = useSpeechSetupStore((s) => s.status)
  const refresh = useSpeechSetupStore((s) => s.refresh)
  useEffect(() => {
    void refresh()
  }, [refresh])
  return status
}

/**
 * Plan 0015: reads the chip, memory and free disk space when a speech screen opens, and returns
 * the result (null until it arrives).
 */
export function useSpeechHardware() {
  const hardware = useSpeechSetupStore((s) => s.hardware)
  const refreshHardware = useSpeechSetupStore((s) => s.refreshHardware)
  useEffect(() => {
    void refreshHardware()
  }, [refreshHardware])
  return hardware
}
