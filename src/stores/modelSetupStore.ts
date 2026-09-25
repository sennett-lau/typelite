import { create } from 'zustand'
import type { SpeechHardwareCheck, SpeechModelInfo, SpeechSetupStatus } from '../lib/tauri'

/**
 * A built-in model setup as the frontend sees it (speech, plan 0012, and AI, plan 0017). The
 * backend owns the download; the store mirrors its status events, so the progress survives
 * leaving the onboarding step or Settings and also shows on Home.
 */
export interface ModelSetupStore {
  status: SpeechSetupStatus
  /** Known models and whether each is installed; null until loaded. */
  models: SpeechModelInfo[] | null
  /** Chip, memory, free disk and the models this Mac is offered; null until read. */
  hardware: SpeechHardwareCheck | null
  applyStatus: (status: SpeechSetupStatus) => void
  /** Asks the backend for the current status and model list (after a window opens). */
  refresh: () => Promise<void>
  refreshModels: () => Promise<void>
  /** Reads the hardware again (when a setup screen opens, and after a model changed). */
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

/** The backend calls one store reads from. */
export interface ModelSetupApi {
  /** For log messages: "speech setup", "AI setup". */
  label: string
  getStatus: () => Promise<SpeechSetupStatus>
  listModels: () => Promise<SpeechModelInfo[]>
  getHardware: () => Promise<SpeechHardwareCheck>
}

export function createModelSetupStore(api: ModelSetupApi) {
  return create<ModelSetupStore>((set, get) => ({
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
        const status = await api.getStatus()
        if (status) set({ status })
      } catch (error) {
        console.error(`[${api.label}] failed to read the status`, error)
      }
      await get().refreshModels()
    },
    refreshModels: async () => {
      try {
        const models = await api.listModels()
        if (Array.isArray(models)) set({ models })
      } catch (error) {
        console.error(`[${api.label}] failed to list models`, error)
      }
    },
    refreshHardware: async () => {
      try {
        const hardware = await api.getHardware()
        if (hardware && Array.isArray(hardware.offer?.models)) set({ hardware })
      } catch (error) {
        console.error(`[${api.label}] failed to check the hardware`, error)
      }
    },
  }))
}

export type ModelSetupStoreHook = ReturnType<typeof createModelSetupStore>

/** True while a download, check or test runs. */
export function isSetupRunning(status: SpeechSetupStatus): boolean {
  return (
    status.phase === 'downloading' || status.phase === 'verifying' || status.phase === 'testing'
  )
}
