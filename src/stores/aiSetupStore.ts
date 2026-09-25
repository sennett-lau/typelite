import { getAiHardware, getAiSetupStatus, listAiModels } from '../lib/tauri'
import { createModelSetupStore } from './modelSetupStore'

/**
 * Plan `ai-polish-setup`: the Built-in AI setup, mirrored from the backend's `ai-setup:status`
 * events (see `modelSetupStore`).
 */
export const useAiSetupStore = createModelSetupStore({
  label: 'AI setup',
  getStatus: () => getAiSetupStatus(),
  listModels: () => listAiModels(),
  getHardware: () => getAiHardware(),
})
