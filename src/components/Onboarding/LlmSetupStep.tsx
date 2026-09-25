import { AI_SERVICE } from '../Speech/services'
import { EngineSetupStep } from './SttSetupStep'

/**
 * Onboarding → AI polish (plan 0017): the same card, sheet and links as the speech step, for
 * Built-in AI and "your own server or API key". Skipping keeps dictation working; it pastes
 * the raw transcript.
 */
export function LlmSetupStep({ onSkip }: { onSkip: () => void }) {
  return <EngineSetupStep service={AI_SERVICE} onSkip={onSkip} />
}
