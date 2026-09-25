import { create } from 'zustand'
import {
  getSpeechSetupStatus,
  listSpeechModels,
  type SpeechModelInfo,
  type SpeechSetupStatus,
} from '../lib/tauri'

/**
 * Plan 0012: the Quick speech setup as the frontend sees it. The backend owns the download;
 * this store mirrors its `speech-setup:status` events, so the progress survives leaving the
 * onboarding step or Settings and also shows on Home.
 */
interface SpeechSetupStore {
  status: SpeechSetupStatus
  /** Known models and whether each is installed; null until loaded. */
  models: SpeechModelInfo[] | null
  applyStatus: (status: SpeechSetupStatus) => void
  /** Asks the backend for the current status and model list (after a window opens). */
  refresh: () => Promise<void>
  refreshModels: () => Promise<void>
}

export const IDLE_SETUP_STATUS: SpeechSetupStatus = {
  modelId: null,
  phase: 'idle',
  downloadedBytes: 0,
  totalBytes: 0,
  bytesPerSecond: 0,
  error: null,
}

export const useSpeechSetupStore = create<SpeechSetupStore>((set, get) => ({
  status: IDLE_SETUP_STATUS,
  models: null,
  applyStatus: (status) => {
    const previous = get().status.phase
    set({ status })
    // A finished setup installed a model: the Built-in models list changes.
    if (status.phase === 'ready' && previous !== 'ready') {
      void get().refreshModels()
    }
  },
  refresh: async () => {
    try {
      const status = await getSpeechSetupStatus()
      if (status) set({ status })
    } catch (error) {
      console.error('[speech setup] failed to read the status', error)
    }
    await get().refreshModels()
  },
  refreshModels: async () => {
    try {
      const models = await listSpeechModels()
      if (Array.isArray(models)) set({ models })
    } catch (error) {
      console.error('[speech setup] failed to list models', error)
    }
  },
}))

/** True while a download, check or test runs. */
export function isSetupRunning(status: SpeechSetupStatus): boolean {
  return (
    status.phase === 'downloading' || status.phase === 'verifying' || status.phase === 'testing'
  )
}
