import { create } from 'zustand'
import {
  getSpeechHardware,
  getSpeechSetupStatus,
  listSpeechModels,
  type SpeechHardwareCheck,
  type SpeechModelInfo,
  type SpeechSetupStatus,
} from '../lib/tauri'

/**
 * Plan `quick-speech-setup`: the Quick speech setup as the frontend sees it. The backend owns the
 * download; this store mirrors its `speech-setup:status` events, so the progress survives leaving
 * the onboarding step or Settings and also shows on Home.
 */
interface SpeechSetupStore {
  status: SpeechSetupStatus
  /** Known models and whether each is installed; null until loaded. */
  models: SpeechModelInfo[] | null
  /**
   * Plan `two-tab-speech`: chip, memory, free disk and the models this Mac is offered; null until
   * read.
   */
  hardware: SpeechHardwareCheck | null
  applyStatus: (status: SpeechSetupStatus) => void
  /** Asks the backend for the current status and model list (after a window opens). */
  refresh: () => Promise<void>
  refreshModels: () => Promise<void>
  /** Reads the hardware again (when a speech screen opens, and after a model changed). */
  refreshHardware: () => Promise<void>
}

export const IDLE_SETUP_STATUS: SpeechSetupStatus = {
  modelId: null,
  phase: 'idle',
  downloadedBytes: 0,
  totalBytes: 0,
  bytesPerSecond: 0,
  error: null,
  testMs: null,
}

export const useSpeechSetupStore = create<SpeechSetupStore>((set, get) => ({
  status: IDLE_SETUP_STATUS,
  models: null,
  hardware: null,
  applyStatus: (status) => {
    const previous = get().status.phase
    set({ status })
    // A finished setup installed a model: the model list and the free space change.
    if (status.phase === 'ready' && previous !== 'ready') {
      void get().refreshModels()
      void get().refreshHardware()
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
  refreshHardware: async () => {
    try {
      const hardware = await getSpeechHardware()
      if (hardware && Array.isArray(hardware.offer?.models)) set({ hardware })
    } catch (error) {
      console.error('[speech setup] failed to check the hardware', error)
    }
  },
}))

/** True while a download, check or test runs. */
export function isSetupRunning(status: SpeechSetupStatus): boolean {
  return (
    status.phase === 'downloading' || status.phase === 'verifying' || status.phase === 'testing'
  )
}
