import { useAppStore } from '../../stores/appStore'
import { isSpeechReady } from '../../lib/readiness'
import { SpeechPresetEditor } from '../Settings/SpeechPresetEditor'
import { SkipLink } from './SetupGuide'

/**
 * Onboarding step: the speech editor in its short form (plan 0014: type, that type's fields,
 * Test, the guide link; language stays on auto-detect), with Quick setup for the built-in
 * type (plan 0012), and "Skip for now". Next unlocks once the active preset passed a Test.
 */
export function SttSetupStep({ onSkip }: { onSkip: () => void }) {
  const ready = useAppStore((s) => isSpeechReady(s.config))

  return (
    <div className="space-y-4">
      <div>
        <SpeechPresetEditor context="onboarding" />
      </div>
      {!ready && <SkipLink onSkip={onSkip} />}
    </div>
  )
}
