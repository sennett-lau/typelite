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
import { ShortcutSetupPage } from './ShortcutSetupPage'
import { ExercisePage } from './ExercisePage'
import {
  SHORTCUT_PAGES,
  applyShortcutGate,
  setupComplete,
  shortcutGateForRole,
} from './shortcutConfig'
import type { ShortcutPage, ShortcutRole } from './shortcutConfig'
import { skippedStatus } from './exerciseFlow'
import type { ExerciseStatus } from './exerciseFlow'
import type { ExerciseId } from './exercises'
import { usePermissions } from './usePermissions'
import { slideRight } from '../../lib/animations'

/**
 * Welcome + permissions, microphone, speech, AI, then the shortcut pages (plan
 * `tutorial-one-page`): per shortcut a setup page and one page per exercise.
 */
export const TOTAL_STEPS = SHORTCUT_TOUR_FIRST_STEP + SHORTCUT_PAGES.length

/** Step index of the AI step, the last step before the shortcut pages. */
const AI_STEP = 3

/** The shortcut page shown at `step`, if it is one. */
function shortcutPageAt(step: number): ShortcutPage | undefined {
  return step >= SHORTCUT_TOUR_FIRST_STEP
    ? SHORTCUT_PAGES[step - SHORTCUT_TOUR_FIRST_STEP]
    : undefined
}

const ROLE_TITLE: Record<ShortcutRole, { title: string; subtitle: string }> = {
  dictation: { title: 'onboarding.steps.dictate', subtitle: 'onboarding.steps.dictateSub' },
  translate: { title: 'onboarding.steps.translate', subtitle: 'onboarding.steps.translateSub' },
  ask: { title: 'onboarding.steps.ask', subtitle: 'onboarding.steps.askSub' },
}

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
  const page = shortcutPageAt(step)
  const setupDone = useAppStore((s) =>
    page?.kind === 'setup' ? setupComplete(s.config, page.role) : false,
  )
  // Kept here (not in the page) so Back and Next keep a passed exercise passed.
  const [statuses, setStatuses] = useState<Partial<Record<ExerciseId, ExerciseStatus>>>({})
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

  // Plan `onboarding-shortcut-gate`: until onboarding is finished only the shortcut an exercise
  // page teaches may run; setup pages and the other steps allow none. The backend starts closed,
  // so this only opens it.
  const gateRole = page?.kind === 'exercise' ? page.role : undefined
  useEffect(() => {
    void applyShortcutGate(shortcutGateForRole(gateRole))
  }, [gateRole])

  const isLast = step === TOTAL_STEPS - 1
  const exerciseDone = page?.kind === 'exercise' && statuses[page.exercise.id] === 'done'
  // The tour starts at the Dictate step; the earlier steps are already done.
  const firstStep = tour ? SHORTCUT_TOUR_FIRST_STEP : 0

  const canNext = (() => {
    if (page) return page.kind === 'setup' ? setupDone : exerciseDone
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
    ...SHORTCUT_PAGES.map((shortcutPage) =>
      shortcutPage.kind === 'setup'
        ? {
            title: t(ROLE_TITLE[shortcutPage.role].title),
            subtitle: t(ROLE_TITLE[shortcutPage.role].subtitle),
          }
        : {
            title: t(`onboarding.exercises.${shortcutPage.exercise.id}.title`),
            subtitle: t('onboarding.exercises.subtitle', {
              role: t(ROLE_TITLE[shortcutPage.role].title),
              n: shortcutPage.number,
              total: shortcutPage.total,
            }),
          },
    ),
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
   * Ends onboarding and opens Home. `tourDone` is true after the last exercise; the tour flag is
   * saved on its own so a skipped tour can be offered again later.
   */
  const finish = async (tourDone: boolean) => {
    setFinishError(null)
    try {
      await saveConfig(useAppStore.getState().config)
      await saveOnboardingCompleted()
      await applyShortcutGate('all')
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
    void applyShortcutGate('all')
    useAppStore.setState({ onboardingTour: false })
    setOnboardingCompleted(true)
  }

  const markDone = (id: ExerciseId) =>
    setStatuses((previous) => (previous[id] === 'done' ? previous : { ...previous, [id]: 'done' }))

  // Skip: the exercise counts as skipped (a passed one stays done), and the next page opens.
  const handleSkip = async () => {
    if (page?.kind !== 'exercise') return
    const id = page.exercise.id
    setStatuses((previous) => ({ ...previous, [id]: skippedStatus(previous[id]) }))
    await handleNext()
  }

  const nextLabel = isLast
    ? t('onboarding.layout.finish')
    : page?.kind === 'setup'
      ? t('onboarding.layout.tryIt')
      : t('onboarding.layout.next')

  return (
    <OnboardingLayout
      step={step}
      totalSteps={TOTAL_STEPS}
      title={titles[step]?.title ?? ''}
      subtitle={titles[step]?.subtitle}
      canNext={canNext}
      canBack={step > firstStep}
      nextLabel={nextLabel}
      onNext={handleNext}
      onBack={handleBack}
      onSkip={page?.kind === 'exercise' && !exerciseDone ? handleSkip : undefined}
      onClose={tour ? handleCloseTour : undefined}
      wideContent={step === 2}
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
          {page?.kind === 'setup' && <ShortcutSetupPage role={page.role} />}
          {page?.kind === 'exercise' && (
            <ExercisePage
              role={page.role}
              exercise={page.exercise}
              onPassed={() => markDone(page.exercise.id)}
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
