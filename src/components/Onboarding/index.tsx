import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { SHORTCUT_TOUR_FIRST_STEP, useAppStore } from '../../stores/appStore'
import {
  getConfig,
  saveOnboardingCompleted,
  setShortcutTourState,
  updateConfig as saveConfig,
} from '../../lib/tauri'
import { isAiReady, isSpeechReady } from '../../lib/readiness'
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

/** Step index of the AI step, the last step before the shortcut tutorials. */
const AI_STEP = 3

/** Step index of each shortcut tutorial. */
const SHORTCUT_STEPS: Record<number, ShortcutRole> = {
  [SHORTCUT_TOUR_FIRST_STEP]: 'dictation',
  [SHORTCUT_TOUR_FIRST_STEP + 1]: 'translate',
  [SHORTCUT_TOUR_FIRST_STEP + 2]: 'ask',
}

type PracticeDone = Record<ShortcutRole, boolean>

export function Onboarding() {
  const { t } = useTranslation()
  const step = useAppStore((s) => s.onboardingStep)
  const setStep = useAppStore((s) => s.setOnboardingStep)
  const setOnboardingCompleted = useAppStore((s) => s.setOnboardingCompleted)
  const setConfig = useAppStore((s) => s.setConfig)
  const applyPersistedConfigPatch = useAppStore((s) => s.applyPersistedConfigPatch)
  const tour = useAppStore((s) => s.onboardingTour)
  const speechReady = useAppStore((s) => isSpeechReady(s.config))
  const aiReady = useAppStore((s) => isAiReady(s.config))
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
  // The tour starts at the Dictate step; the earlier steps are already done.
  const firstStep = tour ? SHORTCUT_TOUR_FIRST_STEP : 0

  const canNext = (() => {
    if (shortcutRole) return practiceDone[shortcutRole]
    switch (step) {
      case 0:
        return permissions.allGranted
      case 1:
        return true // a device is always chosen; "System default" counts
      case 2:
        return speechReady
      case AI_STEP:
        return aiReady
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
    { title: t('onboarding.steps.aiPolish'), subtitle: t('onboarding.steps.aiPolishSub') },
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

  /**
   * Ends onboarding and opens Home. `tourDone` is true after the Ask step; the tour flag is
   * saved on its own so a skipped tour can be offered again later.
   */
  const finish = async (tourDone: boolean) => {
    setFinishError(null)
    try {
      await saveConfig(useAppStore.getState().config)
      await saveOnboardingCompleted()
      if (tourDone) {
        applyPersistedConfigPatch({ shortcut_tour_completed: true })
        await setShortcutTourState({ completed: true }).catch((error) =>
          console.error('[onboarding] failed to save the finished tour', error),
        )
      }
      useAppStore.setState({ onboardingTour: false })
      window.location.hash = '#/'
      setOnboardingCompleted(true)
    } catch (error) {
      setFinishError(String(error))
    }
  }

  /**
   * After the AI step (Next or Skip): the shortcut tutorials need both services, so they
   * follow only when both passed a Test. Otherwise onboarding ends here and Home shows what is
   * left to set up; the tour is offered once both work.
   */
  const leaveAiStep = async () => {
    const { config } = useAppStore.getState()
    if (isSpeechReady(config) && isAiReady(config)) {
      await goTo(SHORTCUT_TOUR_FIRST_STEP)
    } else {
      await finish(false)
    }
  }

  const handleNext = async () => {
    if (isLast) {
      await finish(true)
    } else if (step === AI_STEP) {
      await leaveAiStep()
    } else {
      await goTo(step + 1)
    }
  }

  const handleBack = async () => {
    if (step > firstStep) await goTo(step - 1)
  }

  // Closing the tour goes back to Home; closing first-run onboarding quits (the default).
  const handleCloseTour = () => {
    useAppStore.setState({ onboardingTour: false })
    setOnboardingCompleted(true)
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
      canBack={step > firstStep}
      nextLabel={isLast ? t('onboarding.layout.finish') : t('onboarding.layout.next')}
      onNext={handleNext}
      onBack={handleBack}
      onClose={tour ? handleCloseTour : undefined}
      centerContent={step === 0}
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
          {step === 2 && <SttSetupStep onSkip={() => goTo(AI_STEP)} />}
          {step === AI_STEP && <LlmSetupStep onSkip={leaveAiStep} />}
          {shortcutRole && (
            <ShortcutStep
              key={shortcutRole}
              role={shortcutRole}
              done={practiceDone[shortcutRole]}
              onDone={() => markDone(shortcutRole)}
            />
          )}
          {finishError && (
            <p className="mt-3 text-[12px] text-error">
              {t('onboarding.saveFailed', { error: finishError })}
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </OnboardingLayout>
  )
}
