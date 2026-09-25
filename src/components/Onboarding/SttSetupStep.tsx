import { useAppStore } from '../../stores/appStore'
import { isSpeechReady } from '../../lib/readiness'
import { SpeechPresetEditor } from '../Settings/SpeechPresetEditor'
import { SetupGuide, SkipLink } from './SetupGuide'

/**
 * Onboarding step: the same speech preset editor as Settings → Speech (preset, URL, model,
 * language, key, Test, "Save as new preset"), the in-app setup guide, and "Skip for now".
 * Next unlocks once the active preset passed a Test.
 */
export function SttSetupStep({ onSkip }: { onSkip: () => void }) {
  const ready = useAppStore((s) => isSpeechReady(s.config))

  return (
    <div className="space-y-4">
      <div>
        <SpeechPresetEditor />
      </div>
      <SetupGuide kind="speech" />
      {!ready && <SkipLink onSkip={onSkip} />}
    </div>
  )
}
