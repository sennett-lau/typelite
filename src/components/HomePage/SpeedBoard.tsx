import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { Lightbulb } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { getRunTimings } from '../../lib/tauri'
import {
  addRun,
  currentPresets,
  formatMs,
  isOk,
  RUN_TIMING_EVENT,
  SPEECH_GUIDE_URL,
  speedTip,
  STEP_COLOR,
  STEP_IDS,
  stepMs,
  typicalTimes,
  type RunMode,
  type RunTiming,
  type StepId,
} from '../../lib/speed'
import { Group } from '../ui/Group'

/**
 * Loads the kept runs when Home opens and adds each new run from its event. Runs live only in
 * the backend's memory, so a closed Home misses nothing: it asks again when it opens.
 */
function useRunTimings(): RunTiming[] {
  const [runs, setRuns] = useState<RunTiming[]>([])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null

    listen<RunTiming>(RUN_TIMING_EVENT, (event) => {
      if (!disposed && event.payload) setRuns((current) => addRun(current, event.payload))
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch(() => {
        // Not running inside Tauri (tests, plain browser): the board stays empty.
      })

    getRunTimings()
      .then((list) => {
        if (disposed || !Array.isArray(list)) return
        // Keep any run whose event arrived before the list did.
        setRuns((current) =>
          current.reduce((merged, run) => addRun(merged, run), list).sort((a, b) => a.id - b.id),
        )
      })
      .catch(() => {
        // Same as above.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return runs
}

/** The label of a step; the AI step is named after what the AI did in that mode. */
function useStepLabel() {
  const { t } = useTranslation()
  return (step: StepId, mode?: RunMode) => {
    if (step === 'ai' && mode === 'translate') return t('home.speed.steps.aiTranslate')
    if (step === 'ai' && mode === 'ask') return t('home.speed.steps.aiAnswer')
    return t(`home.speed.steps.${step}`)
  }
}

function StepDot({ step }: { step: StepId }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ background: STEP_COLOR[step] }}
    />
  )
}

function LastRun({ run }: { run: RunTiming }) {
  const { t } = useTranslation()
  const stepLabel = useStepLabel()
  const modeName = t(`home.shortcuts.${run.mode}`)
  const steps = STEP_IDS.map((step) => ({ step, ms: stepMs(run, step) }))
  const shown = steps.filter((entry): entry is { step: StepId; ms: number } => entry.ms !== null)
  // Segments are drawn against the sum of the steps (which is the total for a pasted run), so
  // the bar is always full width.
  const barTotal = shown.reduce((sum, entry) => sum + entry.ms, 0) || 1
  const totalText = t(run.mode === 'ask' ? 'home.speed.totalAnswer' : 'home.speed.totalText', {
    time: formatMs(run.totalMs),
  })

  return (
    <div className="px-3.5 py-3" data-testid="speed-last-run">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[12px] font-semibold text-text-secondary">
          {t('home.speed.lastRun')} · {modeName}
        </span>
        <span className="ml-auto text-[13px] font-semibold text-text-primary">{totalText}</span>
        {run.recordingSecs > 0 && (
          <span className="text-[12px] text-text-secondary">
            {t('home.speed.forSpeech', { time: `${run.recordingSecs.toFixed(1)} s` })}
          </span>
        )}
      </div>

      <div
        role="img"
        aria-label={shown
          .map((entry) => `${stepLabel(entry.step, run.mode)} ${formatMs(entry.ms)}`)
          .join(', ')}
        className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
      >
        {shown.map((entry) => (
          <span
            key={entry.step}
            data-testid={`speed-segment-${entry.step}`}
            className="h-full min-w-[3px]"
            style={{
              width: `${(entry.ms / barTotal) * 100}%`,
              background: STEP_COLOR[entry.step],
            }}
          />
        ))}
      </div>

      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[12px]">
        {steps.map(({ step, ms }) => {
          // Paste simply does not exist for an Ask answer; leave it out instead of "skipped".
          if (ms === null && step === 'paste') return null
          return (
            <li
              key={step}
              data-testid={`speed-step-${step}`}
              className="flex items-center gap-1.5 text-text-secondary"
            >
              <StepDot step={step} />
              <span>{stepLabel(step, run.mode)}</span>
              <span className="font-mono text-text-primary">
                {ms === null ? t('home.speed.skipped') : formatMs(ms)}
              </span>
            </li>
          )
        })}
      </ul>

      {!isOk(run) && (
        <p className="m-0 mt-2 text-[12px] text-error">
          {t('home.speed.failed', { code: run.outcome })}
        </p>
      )}
    </div>
  )
}

function TypicalRows({ runs }: { runs: RunTiming[] }) {
  const { t } = useTranslation()
  const stepLabel = useStepLabel()
  const config = useAppStore((s) => s.config)
  const typical = typicalTimes(runs, currentPresets(config))

  return (
    <div className="border-t border-hairline px-3.5 py-3" data-testid="speed-typical">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[12px] font-semibold text-text-secondary">
          {t('home.speed.typical')}
        </span>
        {typical && (
          <span className="ml-auto text-[11.5px] text-text-tertiary">
            {typical.runCount === 1
              ? t('home.speed.basedOnOne')
              : t('home.speed.basedOnMany', { count: typical.runCount })}
          </span>
        )}
      </div>
      {typical ? (
        <TypicalBars steps={typical.steps} stepLabel={stepLabel} />
      ) : (
        <p className="m-0 mt-1.5 text-[12px] text-text-secondary">{t('home.speed.noTypical')}</p>
      )}
    </div>
  )
}

function TypicalBars({
  steps,
  stepLabel,
}: {
  steps: Record<StepId, number | null>
  stepLabel: (step: StepId) => string
}) {
  const { t } = useTranslation()
  const largest = Math.max(1, ...STEP_IDS.map((step) => steps[step] ?? 0))
  return (
    <ul className="m-0 mt-2 list-none space-y-1.5 p-0">
      {STEP_IDS.map((step) => {
        const ms = steps[step]
        return (
          <li
            key={step}
            data-testid={`speed-typical-${step}`}
            className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12px]"
          >
            <span className="flex min-w-0 items-center gap-1.5 text-text-secondary">
              <StepDot step={step} />
              <span className="truncate">{stepLabel(step)}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
              {ms !== null && (
                <span
                  className="block h-full min-w-[3px] rounded-full"
                  style={{ width: `${(ms / largest) * 100}%`, background: STEP_COLOR[step] }}
                />
              )}
            </span>
            <span className="text-right font-mono text-text-primary">
              {ms === null ? t('home.speed.skipped') : formatMs(ms)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Tip({ runs }: { runs: RunTiming[] }) {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const typical = typicalTimes(runs, currentPresets(config))
  const last = runs[runs.length - 1]

  // Prefer the typical values; fall back to the last run when it finished normally.
  let tip = null
  if (typical) {
    tip = speedTip(typical.steps, typical.totalMs, config.output_mode)
  } else if (last && isOk(last)) {
    const steps = Object.fromEntries(STEP_IDS.map((step) => [step, stepMs(last, step)])) as Record<
      StepId,
      number | null
    >
    tip = speedTip(steps, last.totalMs, config.output_mode)
  }
  if (!tip) return null

  return (
    <div
      className="flex items-start gap-2 border-t border-hairline px-3.5 py-2.5 text-[12px] text-text-secondary"
      data-testid="speed-tip"
    >
      <Lightbulb size={13} className="mt-[1px] flex-none text-warning" aria-hidden="true" />
      <span>
        {t(`home.speed.tips.${tip}`)}
        {tip === 'speech' && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => {
                openUrl(SPEECH_GUIDE_URL).catch((error) =>
                  console.error('[speed] failed to open the speech guide', error),
                )
              }}
              className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
            >
              {t('home.speed.openSpeechGuide')}
            </button>
          </>
        )}
      </span>
    </div>
  )
}

/**
 * Plan 0008: where the wait goes between "I stopped talking" and "the text is in my app".
 * Shows the last run as a stacked bar, typical medians for the current presets and one tip.
 */
export function SpeedBoard() {
  const { t } = useTranslation()
  const runs = useRunTimings()
  const last = runs[runs.length - 1]

  return (
    <Group label={t('home.speed.title')}>
      {last ? (
        <>
          <LastRun run={last} />
          <TypicalRows runs={runs} />
          <Tip runs={runs} />
        </>
      ) : (
        <p className="m-0 px-3.5 py-3 text-[12.5px] text-text-secondary" data-testid="speed-empty">
          {t('home.speed.empty')}
        </p>
      )}
    </Group>
  )
}
