import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { getConfig, saveOnboardingCompleted, updateConfig as saveConfig } from '../../lib/tauri'
import { OnboardingLayout } from './OnboardingLayout'
import { WelcomeStep } from './WelcomeStep'
import { MicrophoneStep } from './MicrophoneStep'
import { SttSetupStep } from './SttSetupStep'
import { LlmSetupStep } from './LlmSetupStep'
import { ShortcutStep } from './ShortcutStep'
import type { ShortcutRole } from './shortcutConfig'
import { usePermissions } from './usePermissions'
import { slideRight } from '../../lib/animations'

/** Welcome + permissions, microphone, speech, AI, then the three shortcut tutorials. */
export const TOTAL_STEPS = 7

/** Step index of each shortcut tutorial. */
const SHORTCUT_STEPS: Record<number, ShortcutRole> = { 4: 'dictation', 5: 'translate', 6: 'ask' }

type PracticeDone = Record<ShortcutRole, boolean>

export function Onboarding() {
  const { t } = useTranslation()
  const step = useAppStore((s) => s.onboardingStep)
  const setStep = useAppStore((s) => s.setOnboardingStep)
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted)
  const setConfig = useAppStore((s) => s.setConfig)
  const sttTestStatus = useAppStore((s) => s.sttTestStatus)
  const llmTestStatus = useAppStore((s) => s.llmTestStatus)
  const permissions = usePermissions(step === 0)
  // Kept here (not in the step) so Back and Next keep a finished tutorial finished.
  const [practiceDone, setPracticeDone] = useState<PracticeDone>({
    dictation: false,
    translate: false,
    ask: false,
  })
  const [finishError, setFinishError] = useState<string | null>(null)

  // Start from the saved config, so values saved earlier (or on a previous launch) show up
  // and the Rust defaults (Fn, Fn + Left Shift, Fn + Space) are what the recorders display.
  useEffect(() => {
    let cancelled = false
    getConfig()
      .then((config) => {
        if (!cancelled && config) setConfig(config)
      })
      .catch((error) => console.error('[onboarding] failed to load config', error))
    return () => {
      cancelled = true
    }
  }, [setConfig])

  const shortcutRole = SHORTCUT_STEPS[step]
  const isLast = step === TOTAL_STEPS - 1

  const canNext = (() => {
    if (shortcutRole) return practiceDone[shortcutRole]
    switch (step) {
      case 0:
        return permissions.allGranted
      case 1:
        return true // a device is always chosen; "System default" counts
      case 2:
        return sttTestStatus === 'success'
      case 3:
        return llmTestStatus === 'success'
      default:
        return false
    }
  })()

  const titles = [
    { title: t('onboarding.steps.welcome'), subtitle: t('onboarding.steps.welcomeSub') },
    { title: t('onboarding.steps.microphone'), subtitle: t('onboarding.steps.microphoneSub') },
    {
      title: t('onboarding.steps.speechRecognition'),
      subtitle: t('onboarding.steps.speechRecognitionSub'),
    },
    { title: t('onboarding.steps.aiModel'), subtitle: t('onboarding.steps.aiModelSub') },
    { title: t('onboarding.steps.dictate'), subtitle: t('onboarding.steps.dictateSub') },
    { title: t('onboarding.steps.translate'), subtitle: t('onboarding.steps.translateSub') },
    { title: t('onboarding.steps.ask'), subtitle: t('onboarding.steps.askSub') },
  ]

  const saveBestEffort = async () => {
    try {
      await saveConfig(useAppStore.getState().config)
    } catch {
      // Each step already saved its own choice; this is only a safety net.
    }
  }

  const goTo = async (next: number) => {
    await saveBestEffort()
    setStep(next)
  }

  const handleNext = async () => {
    if (!isLast) {
      await goTo(step + 1)
      return
    }
    setFinishError(null)
    try {
      await saveConfig(useAppStore.getState().config)
      await saveOnboardingCompleted()
      setOnboardingCompleted(true)
    } catch (error) {
      setFinishError(String(error))
    }
  }

  const handleBack = async () => {
    if (step > 0) await goTo(step - 1)
  }

  const markDone = (role: ShortcutRole) =>
    setPracticeDone((previous) => (previous[role] ? previous : { ...previous, [role]: true }))

  return (
    <OnboardingLayout
      step={step}
      totalSteps={TOTAL_STEPS}
      title={titles[step]?.title ?? ''}
      subtitle={titles[step]?.subtitle}
      canNext={canNext}
      canBack={step > 0}
      nextLabel={isLast ? t('onboarding.layout.finish') : t('onboarding.layout.next')}
      onNext={handleNext}
      onBack={handleBack}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          variants={slideRight}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
        >
          {step === 0 && <WelcomeStep permissions={permissions} onSkip={() => goTo(1)} />}
          {step === 1 && <MicrophoneStep />}
          {step === 2 && <SttSetupStep />}
          {step === 3 && <LlmSetupStep />}
          {shortcutRole && (
            <ShortcutStep
              key={shortcutRole}
              role={shortcutRole}
              done={practiceDone[shortcutRole]}
              onDone={() => markDone(shortcutRole)}
            />
          )}
          {isLast && finishError && (
            <p className="mt-3 text-[12px] text-error">
              {t('onboarding.saveFailed', { error: finishError })}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
