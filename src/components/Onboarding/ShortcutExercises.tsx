import { useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, SkipForward } from 'lucide-react'
import type { VoiceMode } from '../../stores/appStore'
import { targetLanguageLabel } from '../../lib/constants'
import { Row } from '../ui/Group'
import {
  EXERCISES,
  checkExercise,
  mentions36,
  selectionTranslatePrefill,
  wroteText,
} from './exercises'
import type { Exercise, ExerciseId } from './exercises'
import {
  exerciseFlowReducer,
  flowComplete,
  flowFinished,
  initialExerciseFlow,
} from './exerciseFlow'
import type { ExercisePhase } from './exerciseFlow'
import { useExerciseRun } from './useExerciseRun'
import type { ShortcutRole } from './shortcutConfig'

const ROLE_MODE: Record<ShortcutRole, VoiceMode> = {
  dictation: 'dictate',
  translate: 'translate',
  ask: 'ask',
}

/**
 * How long a run's result may take to reach the box before the check counts as a miss. The
 * paste and `pipeline:insert_result` arrive in either order.
 */
export const MISS_DELAY_MS = 600

/** Exercises with a line to read (or say) out loud. */
const HAS_SCRIPT: Record<ExerciseId, boolean> = {
  correction: true,
  fillers: true,
  speakTranslate: true,
  selectionTranslate: false,
  question: true,
  edit: true,
}

interface Props {
  role: ShortcutRole
  /** The role's shortcut as displayed (`displayBinding`), or '' when none is recorded. */
  keyLabel: string
  holdMode: boolean
  /** The active translation target. */
  target: string
  /** How many translation languages are chosen, for the Switch language hint. */
  targetCount: number
  /** The Switch language key as displayed. */
  switchKeyLabel: string
  /** The step was already completed earlier (Back and Next keep it complete). */
  done: boolean
  onComplete: () => void
}

/**
 * Plan 0013: the scripted exercises of one shortcut step, in order. The step completes once
 * each exercise is done or skipped. Nothing here is stored: the transcript and result live in
 * the card and vanish when it (or the step) changes.
 */
export function ShortcutExercises({
  role,
  keyLabel,
  holdMode,
  target,
  targetCount,
  switchKeyLabel,
  done,
  onComplete,
}: Props) {
  const { t } = useTranslation()
  const exercises = EXERCISES[role]
  const [flow, dispatch] = useReducer(exerciseFlowReducer, exercises.length, initialExerciseFlow)
  const complete = flowComplete(flow)
  const latestComplete = useRef(onComplete)

  useEffect(() => {
    latestComplete.current = onComplete
  })
  useEffect(() => {
    if (complete) latestComplete.current()
  }, [complete])

  const current = exercises[flow.index]

  return (
    <div className="space-y-3">
      <ol
        className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]"
        aria-label={t('onboarding.exercises.list')}
      >
        {exercises.map((exercise, index) => {
          const status = flow.statuses[index]
          return (
            <li
              key={exercise.id}
              className={`flex items-center gap-1 ${
                index === flow.index ? 'text-text-primary' : 'text-text-tertiary'
              }`}
            >
              {status === 'done' ? (
                <CheckCircle2
                  size={12}
                  className="text-success"
                  aria-label={t('onboarding.exercises.statusDone')}
                />
              ) : status === 'skipped' ? (
                <SkipForward size={12} aria-label={t('onboarding.exercises.statusSkipped')} />
              ) : (
                <Circle size={12} aria-hidden />
              )}
              {t(`onboarding.exercises.${exercise.id}.title`)}
            </li>
          )
        })}
      </ol>

      {role === 'translate' && targetCount >= 2 && (
        <p className="text-[12px] text-text-secondary">
          {t('onboarding.exercises.switchHint', { count: targetCount, key: switchKeyLabel })}
        </p>
      )}

      {current && !flowFinished(flow) ? (
        <ExerciseCard
          key={`${current.id}-${flow.attempt}`}
          exercise={current}
          number={flow.index + 1}
          total={exercises.length}
          mode={ROLE_MODE[role]}
          keyLabel={keyLabel}
          holdMode={holdMode}
          target={target}
          phase={flow.phase}
          isLast={flow.index === exercises.length - 1}
          onRunStarted={() => dispatch({ type: 'runStarted' })}
          onResult={(passed) => dispatch({ type: 'result', passed })}
          onRetry={() => dispatch({ type: 'retry' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onNext={() => dispatch({ type: 'next' })}
        />
      ) : (
        <div className="row-group">
          <Row layout="stacked" label={t('onboarding.exercises.allDone')}>
            <p className="flex items-center gap-1 text-[12px] text-success">
              <CheckCircle2 size={13} /> {t(`onboarding.${role}.success`)}
            </p>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => dispatch({ type: 'restart' })}
            >
              {t('onboarding.exercises.practiceAgain')}
            </button>
          </Row>
        </div>
      )}

      {done && !complete && (
        <p className="flex items-center gap-1 text-[12px] text-success">
          <CheckCircle2 size={13} /> {t(`onboarding.${role}.success`)}
        </p>
      )}
    </div>
  )
}

interface CardProps {
  exercise: Exercise
  number: number
  total: number
  mode: VoiceMode
  keyLabel: string
  holdMode: boolean
  target: string
  phase: ExercisePhase
  isLast: boolean
  onRunStarted: () => void
  onResult: (passed: boolean) => void
  onRetry: () => void
  onSkip: () => void
  onNext: () => void
}

function ExerciseCard({
  exercise,
  number,
  total,
  mode,
  keyLabel,
  holdMode,
  target,
  phase,
  isLast,
  onRunStarted,
  onResult,
  onRetry,
  onSkip,
  onNext,
}: CardProps) {
  const { t } = useTranslation()
  const { id } = exercise
  const base = `onboarding.exercises.${id}`
  const wantedPrefill =
    id === 'selectionTranslate'
      ? selectionTranslatePrefill(target)
      : id === 'edit'
        ? t(`${base}.prefill`)
        : ''
  const [prefill, setPrefill] = useState(wantedPrefill)
  const [boxText, setBoxText] = useState(wantedPrefill)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const boxTextRef = useRef(wantedPrefill)
  const run = useExerciseRun(mode, () => boxTextRef.current, onRunStarted)
  const latestResult = useRef(onResult)
  useEffect(() => {
    latestResult.current = onResult
  })

  // The box must have focus so the paste lands in it; a pre-filled box starts selected, as
  // the shortcut works on the selection. Runs when the card appears (it remounts on Try
  // again) and when the pre-filled text changes.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.focus()
    if (prefill) box.setSelectionRange(0, prefill.length)
  }, [prefill])

  // Picking another target language before a run swaps the pre-filled sentence, so it stays
  // in a different language. Never during or after a run (the Switch language key changes the
  // target mid-run), and never over the user's own edits.
  const untouched = phase === 'ready' && !run.landed && !run.said && boxText === prefill
  useEffect(() => {
    if (!untouched || wantedPrefill === prefill) return
    boxTextRef.current = wantedPrefill
    setBoxText(wantedPrefill)
    setPrefill(wantedPrefill)
  }, [untouched, wantedPrefill, prefill])

  const input = {
    said: run.said,
    before: run.before,
    boxText,
    prefill,
    answer: run.answer,
    target,
  }
  const passed = run.landed && checkExercise(id, input)
  const wrote = run.landed || run.said ? wroteText(id, input) : ''

  // Check once the run landed. A pass counts at once; a miss only after the paste had time to
  // arrive, and a later change of the box can still turn it into a pass.
  useEffect(() => {
    if (!run.landed || phase === 'success') return
    if (passed) {
      latestResult.current(true)
      return
    }
    const timer = setTimeout(() => latestResult.current(false), MISS_DELAY_MS)
    return () => clearTimeout(timer)
  }, [run.landed, passed, phase])

  const instruction = (() => {
    if (!keyLabel) return t('onboarding.shortcut.recordFirst')
    const values = { key: keyLabel }
    if (id === 'selectionTranslate' || id === 'edit' || id === 'question') {
      return t(holdMode ? `${base}.instructionHold` : `${base}.instruction`, values)
    }
    return t(holdMode ? 'onboarding.exercises.speakHold' : 'onboarding.exercises.speak', values)
  })()

  const language = targetLanguageLabel(target, t)
  const sameLanguage =
    id === 'speakTranslate' && target.split('-')[0] === t('onboarding.exercises.scriptLanguage')

  const caption =
    id === 'question' && mentions36(wrote)
      ? t(`${base}.captionRight`)
      : t(`${base}.caption`, { language })

  const showPanel = run.landed || Boolean(run.said)

  return (
    <div className="row-group">
      <Row
        layout="stacked"
        label={t('onboarding.exercises.progress', {
          n: number,
          total,
          title: t(`${base}.title`),
        })}
      >
        <p className="mb-2 text-[12px] leading-relaxed text-text-secondary">{instruction}</p>
        {HAS_SCRIPT[id] && (
          <div className="mb-2 rounded-[8px] bg-bg-secondary px-3 py-2">
            <p className="mb-0.5 text-[11px] text-text-tertiary">
              {t(id === 'edit' ? 'onboarding.exercises.sayThis' : 'onboarding.exercises.readThis')}
            </p>
            <p className="text-[13px] text-text-primary">{t(`${base}.script`)}</p>
          </div>
        )}
        {sameLanguage && (
          <p className="mb-2 text-[11px] text-text-tertiary">
            {t('onboarding.exercises.sameLanguage', { language })}
          </p>
        )}
        <textarea
          ref={boxRef}
          aria-label={t('onboarding.practice.label')}
          value={boxText}
          onChange={(event) => {
            boxTextRef.current = event.target.value
            setBoxText(event.target.value)
            run.noteBoxChange(event.target.value)
          }}
          rows={3}
          placeholder={t('onboarding.practice.placeholder')}
          className="field w-full resize-none text-[13px]"
        />

        {showPanel && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]" data-testid="before-after">
            <div className="rounded-[8px] bg-bg-secondary px-3 py-2">
              <p className="mb-0.5 text-[11px] text-text-tertiary">
                {t('onboarding.exercises.youSaid')}
              </p>
              <p className="whitespace-pre-wrap text-text-primary">
                {run.said || t('onboarding.exercises.nothingSaid')}
              </p>
            </div>
            <div className="rounded-[8px] bg-bg-secondary px-3 py-2">
              <p className="mb-0.5 text-[11px] text-text-tertiary">
                {t('onboarding.exercises.typeliteWrote')}
              </p>
              <p className="whitespace-pre-wrap text-text-primary">
                {wrote || t('onboarding.exercises.waiting')}
              </p>
            </div>
          </div>
        )}

        {phase === 'success' ? (
          <p className="mt-2 flex items-center gap-1 text-[12px] text-success">
            <CheckCircle2 size={13} /> {caption}
          </p>
        ) : run.error ? (
          <p className="mt-2 text-[12px] text-error">
            {t('onboarding.practice.failed', { error: run.error })}
          </p>
        ) : (
          phase === 'miss' && (
            <p className="mt-2 text-[12px] text-text-secondary">{t('onboarding.exercises.miss')}</p>
          )
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {phase === 'success' && (
            <button type="button" className="btn-accent" onClick={onNext}>
              {t(isLast ? 'onboarding.exercises.finish' : 'onboarding.exercises.next')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {t('onboarding.exercises.tryAgain')}
          </button>
          {phase !== 'success' && (
            <button type="button" className="btn-secondary" onClick={onSkip}>
              {t('onboarding.exercises.skip')}
            </button>
          )}
        </div>
      </Row>
    </div>
  )
}
