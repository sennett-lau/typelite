import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ChevronRight, Lightbulb } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { getRunTimings } from '../../lib/tauri'
import {
  addRun,
  aiPresetSpeeds,
  averageTimes,
  formatMs,
  formatSeconds,
  INSIGHT_STEPS,
  RUN_TIMING_EVENT,
  SPEECH_GUIDE_URL,
  speedTip,
  speechPresetSpeeds,
  STEP_COLOR,
  type AverageTimes,
  type PresetSpeed,
  type RunTiming,
  type StepId,
} from '../../lib/speed'
import { Group } from '../ui/Group'

/**
 * Loads the kept runs when Home opens and adds each new run from its event. The backend keeps
 * the runs (plan `speed-by-preset`), so a closed Home misses nothing: it asks again when it opens.
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

function StepDot({ step }: { step: StepId }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 flex-none rounded-full"
      style={{ background: STEP_COLOR[step] }}
    />
  )
}

/**
 * Plan `home-refresh`: the average run across all presets as one stacked bar (speech
 * recognition, AI polish, paste), the total and how many runs it is based on.
 */
function AverageRun({ average }: { average: AverageTimes }) {
  const { t } = useTranslation()
  const shown = INSIGHT_STEPS.map((step) => ({ step, ms: average.steps[step] })).filter(
    (entry): entry is { step: StepId; ms: number } => entry.ms !== null,
  )
  // Segments are drawn against the sum of the shown steps, which is also the total.
  const barTotal = average.totalMs || 1

  return (
    <div className="px-3.5 py-3" data-testid="speed-average">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
        <span className="font-semibold text-text-secondary">{t('home.speed.average')}</span>
        <span className="text-text-secondary" data-testid="speed-run-count">
          {average.runCount === 1
            ? t('home.speed.runsOne')
            : t('home.speed.runsMany', { count: average.runCount })}
        </span>
        <span className="ml-auto text-[13px] font-semibold text-text-primary">
          {t('home.speed.totalText', { time: formatMs(average.totalMs) })}
        </span>
      </div>

      <div
        role="img"
        aria-label={shown
          .map((entry) => `${t(`home.speed.steps.${entry.step}`)} ${formatMs(entry.ms)}`)
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
        {INSIGHT_STEPS.map((step) => {
          const ms = average.steps[step]
          return (
            <li
              key={step}
              data-testid={`speed-step-${step}`}
              className="flex items-center gap-1.5 text-text-secondary"
            >
              <StepDot step={step} />
              <span>{t(`home.speed.steps.${step}`)}</span>
              <span className="font-mono text-text-primary">
                {ms === null ? '—' : formatMs(ms)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** One list of the comparison: a row per preset with its run count, a bar and its average. */
function PresetList({
  title,
  speeds,
  color,
  nameOf,
  testId,
}: {
  title: React.ReactNode
  speeds: PresetSpeed[]
  color: string
  nameOf: (speed: PresetSpeed) => string
  testId: string
}) {
  const { t } = useTranslation()
  const slowest = Math.max(1, ...speeds.map((speed) => speed.average ?? 0))

  return (
    <div className="min-w-0" data-testid={testId}>
      <h5 className="m-0 mt-1.5 mb-2 text-[11px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
        {title}
      </h5>
      {speeds.length === 0 ? (
        <p className="m-0 text-[12px] text-text-secondary">{t('home.speed.compare.empty')}</p>
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {speeds.map((speed) => {
            const name = nameOf(speed)
            return (
              <li
                key={`${speed.presetId}-${speed.model}`}
                data-testid="compare-row"
                className="grid grid-cols-[minmax(0,1fr)_90px_52px] items-center gap-2 text-[12px]"
              >
                <span className="flex min-w-0 items-baseline gap-1" title={name}>
                  <span className="truncate text-text-primary">{name}</span>
                  {speed.fastest && (
                    <span className="fastest-tag">{t('home.speed.compare.fastest')}</span>
                  )}
                  <small className="flex-none text-[11px] text-text-tertiary">
                    {speed.runCount === 1
                      ? t('home.speed.compare.runsOne')
                      : t('home.speed.compare.runsMany', { count: speed.runCount })}
                  </small>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                  {speed.average !== null && (
                    <span
                      className="block h-full min-w-[3px] rounded-full"
                      style={{ width: `${(speed.average / slowest) * 100}%`, background: color }}
                    />
                  )}
                </span>
                <span className="text-right font-mono text-text-primary tabular-nums">
                  {speed.average === null ? '—' : formatSeconds(speed.average)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Plan `speed-by-preset`: "Compare presets", collapsed by default. It opens with a height
 * animation (a grid row going from 0fr to 1fr, see `.collapsible` in globals.css) and ranks the AI
 * presets by AI time and the speech presets by recognition time per second of audio.
 */
function ComparePresets({ runs }: { runs: RunTiming[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const aiPresets = useAppStore((s) => s.config.ai_presets)
  const speechPresets = useAppStore((s) => s.config.speech_presets)

  const nameOf =
    (presets: { id: string; name: string }[] | undefined) =>
    (speed: PresetSpeed): string => {
      const preset = (presets ?? []).find((candidate) => candidate.id === speed.presetId)
      const name = preset
        ? preset.name.trim() || t('presets.unnamed')
        : t('home.speed.compare.deleted')
      return speed.model ? `${name} · ${speed.model}` : name
    }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="compare-presets"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-1.5 border-x-0 border-t border-b-0 border-solid border-hairline bg-transparent px-3.5 py-2.5 text-left text-[12.5px] font-semibold text-accent"
      >
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        />
        {t('home.speed.compare.title')}
      </button>
      <div id="compare-presets" className="collapsible" data-open={open} inert={!open}>
        <div>
          <div className="grid grid-cols-2 gap-4 px-3.5 pt-1 pb-3.5">
            <PresetList
              testId="compare-ai"
              title={t('home.speed.compare.ai')}
              speeds={aiPresetSpeeds(runs)}
              color={STEP_COLOR.ai}
              nameOf={nameOf(aiPresets)}
            />
            <PresetList
              testId="compare-speech"
              title={
                <>
                  {t('home.speed.compare.speech')}{' '}
                  <span className="font-normal tracking-normal normal-case">
                    {t('home.speed.compare.perSecond')}
                  </span>
                </>
              }
              speeds={speechPresetSpeeds(runs)}
              color={STEP_COLOR.speech}
              nameOf={nameOf(speechPresets)}
            />
            <p className="col-span-2 m-0 text-[11.5px] text-text-tertiary">
              {t('home.speed.compare.note')}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

/** One tip for the slowest step of the average run. */
function Tip({ average }: { average: AverageTimes }) {
  const { t } = useTranslation()
  const outputMode = useAppStore((s) => s.config.output_mode)
  // Finish recording is not part of the Insights total, so it takes no part in the tip either.
  const tip = speedTip({ ...average.steps, recording: null }, average.totalMs, outputMode)
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
 * Home's Insights (plans `speed-board` and `home-refresh`): where the wait goes between "I
 * stopped talking" and "the text is in my app", averaged over every finished run, plus one tip.
 */
export function SpeedBoard() {
  const { t } = useTranslation()
  const runs = useRunTimings()
  const average = averageTimes(runs)

  return (
    <Group label={t('home.speed.title')}>
      {average ? (
        <>
          <AverageRun average={average} />
          <ComparePresets runs={runs} />
          <Tip average={average} />
        </>
      ) : (
        <p className="m-0 px-3.5 py-3 text-[12.5px] text-text-secondary" data-testid="speed-empty">
          {t(runs.length === 0 ? 'home.speed.empty' : 'home.speed.noFinished')}
        </p>
      )}
    </Group>
  )
}
