import { getSpeechHardware, getSpeechSetupStatus, listSpeechModels } from '../lib/tauri'
import { createModelSetupStore } from './modelSetupStore'

export { IDLE_SETUP_STATUS, isSetupRunning } from './modelSetupStore'

/**
 * Plan 0012: the Quick speech setup, mirrored from the backend's `speech-setup:status` events
 * (see `modelSetupStore`).
 */
export const useSpeechSetupStore = createModelSetupStore({
  label: 'speech setup',
  getStatus: () => getSpeechSetupStatus(),
  listModels: () => listSpeechModels(),
  getHardware: () => getSpeechHardware(),
})
