import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import type { VoiceMode } from '../../stores/appStore'
import { targetLanguageLabel } from '../../lib/constants'
import { switchLanguageLabel } from '../../lib/switchLanguage'
import {
  checkExercise,
  insertedCharCount,
  selectionTranslatePrefill,
  speakTranslateLine,
  wordDiff,
  wroteText,
} from './exercises'
import type { CheckInput, Exercise, ExerciseId } from './exercises'
import { decideDelay, exerciseView } from './exerciseFlow'
import type { ExerciseView, Verdict } from './exerciseFlow'
import { KeyCaps, KeyText } from './KeyCaps'
import { KEY_TOKENS } from './keyTokens'
import { bindingKeys, roleBindings } from './shortcutConfig'
import type { ShortcutRole } from './shortcutConfig'
import { useExerciseRun } from './useExerciseRun'
import { useLiveShortcuts } from './useLiveShortcuts'

const ROLE_MODE: Record<ShortcutRole, VoiceMode> = {
  dictation: 'dictate',
  translate: 'translate',
  ask: 'ask',
}

/** The top card's label before a result. */
const TOP_LABEL: Record<ExerciseId, string> = {
  correction: 'onboarding.exercises.readThis',
  fillers: 'onboarding.exercises.readThis',
  speakTranslate: 'onboarding.exercises.sayAnything',
  selectionTranslate: 'onboarding.exercises.whatHappens',
  question: 'onboarding.exercises.readThis',
  edit: 'onboarding.exercises.sayThis',
}

interface Props {
  role: ShortcutRole
  exercise: Exercise
  /** Called once when the exercise passes (the onboarding unlocks Next). */
  onPassed: () => void
}

/**
 * Plan `tutorial-one-page`: one exercise on its own page. Fixed slots (instruction line, top card,
 * box, result line) keep their size in every state. Try again starts the page afresh.
 */
export function ExercisePage({ role, exercise, onPassed }: Props) {
  const [attempt, setAttempt] = useState(0)
  useLiveShortcuts()
  return (
    <ExerciseCard
      key={attempt}
      role={role}
      exercise={exercise}
      onPassed={onPassed}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}

function ExerciseCard({
  role,
  exercise,
  onPassed,
  onRetry,
}: Props & {
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const hotkeys = useAppStore((s) => s.config.hotkeys)
  const translation = useAppStore((s) => s.config.translation)
  const { id, kind } = exercise
  const base = `onboarding.exercises.${id}`
  const keys = bindingKeys(roleBindings(hotkeys, role)[0])
  const stopKeys = keys.slice(0, 1)
  const switchKeys = hotkeys.switchLanguage
    ? [switchLanguageLabel(hotkeys.switchLanguage, t)]
    : null
  const canSwitch = role === 'translate' && translation.targets.length >= 2 && !!switchKeys
  const holdMode = role !== 'ask' && hotkeys.dictationMode === 'hold'
  const firstTarget = translation.targets[0] ?? ''
  const target = translation.active_target
  const language = targetLanguageLabel(target, t)

  // Fixed when the page opens; Try again opens it afresh.
  const [prefill] = useState(() =>
    id === 'selectionTranslate'
      ? selectionTranslatePrefill(firstTarget)
      : id === 'edit'
        ? t(`${base}.prefill`)
        : '',
  )
  const script =
    id === 'speakTranslate' ? speakTranslateLine(firstTarget) : t(`${base}.script`, { language })

  const [boxText, setBoxText] = useState(prefill)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const boxTextRef = useRef(prefill)
  const run = useExerciseRun(ROLE_MODE[role], () => boxTextRef.current)
  const [verdict, setVerdict] = useState<Verdict>(null)
  const latestPassed = useRef(onPassed)
  useEffect(() => {
    latestPassed.current = onPassed
  })

  // The box must have focus so the paste lands in it; a pre-filled block starts highlighted, as
  // the shortcut works on the selection.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    box.focus()
    if (prefill) box.setSelectionRange(0, prefill.length)
  }, [prefill])

  // A new run clears an earlier "Not quite"; a success stays.
  useEffect(() => {
    if (run.stage === 'listening')
      setVerdict((previous) => (previous === 'success' ? previous : null))
  }, [run.stage])

  const input: CheckInput = {
    said: run.said,
    before: run.before,
    boxText,
    prefill,
    answer: run.answer,
    target,
  }
  const inputRef = useRef(input)
  useEffect(() => {
    inputRef.current = input
  })

  // Decide only once the run landed and the box holds all inserted characters (or stopped
  // changing): the insert result can arrive while keystrokes are still reaching the box. Every
  // change of the box restarts the wait, and can turn a "Not quite" into a success.
  useEffect(() => {
    if (run.stage !== 'landed' || verdict === 'success') return
    const arrived = kind === 'panel' ? 0 : insertedCharCount(run.before, boxText)
    const timer = setTimeout(
      () => {
        const passed = checkExercise(id, inputRef.current)
        setVerdict(passed ? 'success' : 'miss')
        if (passed) latestPassed.current()
      },
      decideDelay(run.expectedChars, arrived),
    )
    return () => clearTimeout(timer)
  }, [run.stage, run.expectedChars, run.before, run.answer, boxText, verdict, id, kind])

  const view = exerciseView({
    stage: run.stage,
    verdict,
    error: run.error,
    noSpeech: run.noSpeech,
  })
  const success = view === 'success'
  const wrote = wroteText(id, input)

  return (
    <div className="flex flex-col gap-3">
      {id === 'speakTranslate' ? (
        <TranslateLegend
          keys={keys}
          stopKeys={stopKeys}
          switchKeys={switchKeys}
          canSwitch={canSwitch}
          twoLanguages={translation.targets.length >= 2}
        />
      ) : (
        <p className="m-0 text-center text-[13px] leading-[1.9] text-text-secondary">
          <KeyText text={t(instructionKey(id, holdMode), KEY_TOKENS)} keys={{ key: keys }} />
        </p>
      )}

      {success ? (
        <div className="tutorial-top tutorial-result" data-testid="result-card">
          <p className="tutorial-result-title">
            <CheckCircle2 size={16} aria-hidden />
            {t(`${base}.success`, { language })}
          </p>
          <p className="tutorial-top-text">
            <ResultChange id={id} said={run.said} script={script} prefill={prefill} wrote={wrote} />
          </p>
        </div>
      ) : (
        <div className="tutorial-top">
          <p className="tutorial-top-label">{t(TOP_LABEL[id])}</p>
          <p className="tutorial-top-text">{script}</p>
        </div>
      )}

      {kind !== 'panel' && (
        <textarea
          ref={boxRef}
          aria-label={t(
            kind === 'selection'
              ? 'onboarding.exercises.blockLabel'
              : 'onboarding.exercises.boxLabel',
          )}
          placeholder={kind === 'speak' ? t('onboarding.exercises.boxLabel') : undefined}
          value={boxText}
          spellCheck={false}
          onChange={(event) => {
            boxTextRef.current = event.target.value
            setBoxText(event.target.value)
          }}
          className={`tutorial-box ${kind === 'selection' ? 'tutorial-box-block' : ''} ${success ? 'tutorial-box-done' : ''}`}
        />
      )}

      <div className="tutorial-line" data-testid="result-line" data-view={view}>
        <ResultLine
          view={view}
          role={role}
          exercise={exercise}
          keys={keys}
          stopKeys={stopKeys}
          switchKeys={canSwitch ? switchKeys : null}
          holdMode={holdMode}
          error={run.error}
          onRetry={onRetry}
        />
      </div>
    </div>
  )
}

/** The i18n key of the instruction line above the top card. */
function instructionKey(id: ExerciseId, holdMode: boolean): string {
  if (id === 'selectionTranslate') {
    return `onboarding.exercises.selectionTranslate.${holdMode ? 'instructionHold' : 'instruction'}`
  }
  if (id === 'edit') return 'onboarding.exercises.edit.instruction'
  return holdMode ? 'onboarding.exercises.speakHold' : 'onboarding.exercises.speak'
}

/** Translate exercise 1: "<keys> Start · <switch> Switch language · <first key> Stop". */
function TranslateLegend({
  keys,
  stopKeys,
  switchKeys,
  canSwitch,
  twoLanguages,
}: {
  keys: string[]
  stopKeys: string[]
  switchKeys: string[] | null
  canSwitch: boolean
  twoLanguages: boolean
}) {
  const { t } = useTranslation()
  const separator = (
    <i className="tutorial-legend-sep" aria-hidden="true">
      ·
    </i>
  )
  const switchTitle = canSwitch
    ? undefined
    : switchKeys && !twoLanguages
      ? t('onboarding.exercises.legend.switchNeedsTwo')
      : t('onboarding.exercises.legend.switchOff')
  return (
    <p className="tutorial-legend" data-testid="translate-legend">
      <span className="tutorial-legend-item">
        <KeyCaps keys={keys} /> {t('onboarding.exercises.legend.start')}
      </span>
      {separator}
      <span
        className={`tutorial-legend-item ${canSwitch ? '' : 'tutorial-legend-off'}`}
        title={switchTitle}
        data-testid="legend-switch"
      >
        <KeyCaps keys={switchKeys ?? ['—']} /> {t('onboarding.exercises.legend.switch')}
      </span>
      {separator}
      <span className="tutorial-legend-item">
        <KeyCaps keys={stopKeys} /> {t('onboarding.exercises.legend.stop')}
      </span>
    </p>
  )
}

/** What changed: struck-through removed words (cleanup), or "original → result". */
function ResultChange({
  id,
  said,
  script,
  prefill,
  wrote,
}: {
  id: ExerciseId
  said: string
  script: string
  prefill: string
  wrote: string
}) {
  if (id === 'correction' || id === 'fillers') {
    return (
      <>
        {wordDiff(said, wrote).map((part, index) =>
          part.removed ? <del key={index}>{part.text}</del> : <span key={index}>{part.text}</span>,
        )}
      </>
    )
  }
  const before = id === 'selectionTranslate' || id === 'edit' ? prefill : said || script
  return (
    <>
      <del>{before}</del>
      <span className="tutorial-arrow" aria-hidden="true">
        →
      </span>
      <span>{wrote}</span>
    </>
  )
}

function ResultLine({
  view,
  role,
  exercise,
  keys,
  stopKeys,
  switchKeys,
  holdMode,
  error,
  onRetry,
}: {
  view: ExerciseView
  role: ShortcutRole
  exercise: Exercise
  keys: string[]
  stopKeys: string[]
  /** The Switch language key, when switching is possible now. */
  switchKeys: string[] | null
  holdMode: boolean
  error: string | null
  onRetry: () => void
}) {
  const { t } = useTranslation()
  switch (view) {
    case 'ready':
      return exercise.kind === 'selection' ? <>{t('onboarding.exercises.highlighted')}</> : null
    case 'listening': {
      const key =
        role === 'translate' && !holdMode
          ? switchKeys
            ? 'onboarding.exercises.listeningTranslate'
            : 'onboarding.exercises.listeningStop'
          : holdMode
            ? 'onboarding.exercises.listeningHold'
            : 'onboarding.exercises.listening'
      return (
        <KeyText
          text={t(key, KEY_TOKENS)}
          keys={{ key: keys, stop: stopKeys, switch: switchKeys ?? [] }}
        />
      )
    }
    case 'writing':
      return (
        <>
          <span className="tutorial-writing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {t(
            exercise.kind === 'panel'
              ? 'onboarding.exercises.thinking'
              : 'onboarding.exercises.writing',
          )}
        </>
      )
    case 'success':
      return null
    case 'miss':
    case 'noSpeech':
    case 'error':
      return (
        <>
          <Info size={14} aria-hidden className="mr-[5px] inline-block align-[-2px]" />
          {view === 'miss'
            ? t('onboarding.exercises.miss')
            : view === 'noSpeech'
              ? t('onboarding.exercises.noSpeech')
              : t('onboarding.exercises.failed', { error: error ?? '' })}
          <button type="button" className="tutorial-line-button" onClick={onRetry}>
            {t('onboarding.exercises.tryAgain')}
          </button>
        </>
      )
  }
}
