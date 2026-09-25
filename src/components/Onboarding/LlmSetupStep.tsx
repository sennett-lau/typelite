import { useAppStore } from '../../stores/appStore'
import { isAiReady } from '../../lib/readiness'
import { AiPresetEditor } from '../Settings/AiPresetEditor'
import { SetupGuide, SkipLink } from './SetupGuide'

/**
 * Onboarding step "AI Polish Service": the same AI preset editor as Settings → AI, the in-app
 * setup guide, and "Skip for now". Next unlocks once the active preset passed a Test.
 */
export function LlmSetupStep({ onSkip }: { onSkip: () => void }) {
  const ready = useAppStore((s) => isAiReady(s.config))

  return (
    <div className="space-y-4">
      <div>
        <AiPresetEditor />
      </div>
      <SetupGuide />
      {!ready && <SkipLink onSkip={onSkip} />}
    </div>
  )
}
