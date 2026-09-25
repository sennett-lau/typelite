import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { makeRun } from '../../../test-utils/runTiming'
import { useAppStore } from '../../../stores/appStore'
import { currentPresets, SPEECH_GUIDE_URL, type RunTiming } from '../../../lib/speed'
import * as tauri from '../../../lib/tauri'
import { SpeedBoard } from '../SpeedBoard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock('../../../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tauri')>()),
  getRunTimings: vi.fn(),
}))

type RunHandler = (event: { payload: RunTiming }) => void
const runHandlers: RunHandler[] = []
const unlistenSpy = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: RunHandler) => {
    if (event === 'timing:run') runHandlers.push(handler)
    return Promise.resolve(unlistenSpy)
  }),
}))

const openUrlSpy = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve())
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (url: string) => openUrlSpy(url),
}))

/** A run made with the presets that are active in the store. */
function run(overrides: Partial<RunTiming> = {}): RunTiming {
  return makeRun({ ...currentPresets(useAppStore.getState().config), ...overrides })
}

async function renderBoard(runs: RunTiming[]) {
  vi.mocked(tauri.getRunTimings).mockResolvedValue(runs)
  render(<SpeedBoard />)
  // Let the fetch and the listener registration settle.
  await act(async () => {})
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState())
  runHandlers.length = 0
  unlistenSpy.mockReset()
  openUrlSpy.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('SpeedBoard', () => {
  it('shows the empty state before the first run', async () => {
    await renderBoard([])

    const board = screen.getByRole('region', { name: 'Speed' })
    expect(within(board).getByTestId('speed-empty')).toHaveTextContent(
      'Dictate once to see where the time goes.',
    )
    expect(screen.queryByTestId('speed-last-run')).not.toBeInTheDocument()
  })

  it('draws the last run as a stacked bar with each step, the total and the speech length', async () => {
    await renderBoard([
      run({ id: 1, speechMs: 3000, totalMs: 3700 }),
      run({ id: 2, recordingSecs: 4.2 }),
    ])

    const last = screen.getByTestId('speed-last-run')
    expect(last).toHaveTextContent('Last run · Dictate')
    expect(last).toHaveTextContent('1.9 s from stop to text')
    expect(last).toHaveTextContent('for 4.2 s of speech')
    expect(within(last).getByTestId('speed-step-recording')).toHaveTextContent(
      'Finish recording100 ms',
    )
    expect(within(last).getByTestId('speed-step-speech')).toHaveTextContent(
      'Speech recognition1.2 s',
    )
    expect(within(last).getByTestId('speed-step-ai')).toHaveTextContent('AI polish400 ms')
    expect(within(last).getByTestId('speed-step-paste')).toHaveTextContent('Paste200 ms')

    // Segment widths follow the step times: 100 + 1200 + 400 + 200 = 1900.
    expect(within(last).getByTestId('speed-segment-speech').style.width).toBe(
      `${(1200 / 1900) * 100}%`,
    )
    expect(within(last).getByTestId('speed-segment-recording').style.background).toBe(
      'var(--color-step-recording)',
    )
    expect(within(last).getByTestId('speed-segment-ai').style.background).toBe(
      'var(--color-step-ai)',
    )
    expect(within(last).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Finish recording 100 ms, Speech recognition 1.2 s, AI polish 400 ms, Paste 200 ms',
    )
  })

  it('marks AI as skipped and draws no AI segment when polish was off', async () => {
    await renderBoard([run({ aiMs: null, pasteMs: 600 })])

    const last = screen.getByTestId('speed-last-run')
    expect(within(last).getByTestId('speed-step-ai')).toHaveTextContent('AI polishskipped')
    expect(within(last).queryByTestId('speed-segment-ai')).not.toBeInTheDocument()
  })

  it('shows an Ask run as stop-to-answer without a paste step', async () => {
    await renderBoard([run({ mode: 'ask', aiMs: 500, pasteMs: null, totalMs: 1800 })])

    const last = screen.getByTestId('speed-last-run')
    expect(last).toHaveTextContent('Last run · Ask anything')
    expect(last).toHaveTextContent('1.8 s from stop to answer')
    expect(within(last).getByTestId('speed-step-ai')).toHaveTextContent('AI answer500 ms')
    expect(within(last).queryByTestId('speed-step-paste')).not.toBeInTheDocument()
  })

  it('says when the last run ended with an error', async () => {
    await renderBoard([
      run({ outcome: 'stt_unreachable', aiMs: null, pasteMs: null, totalMs: 900 }),
    ])

    expect(screen.getByTestId('speed-last-run')).toHaveTextContent(
      'This run ended with an error (stt_unreachable).',
    )
  })

  it('shows typical medians for runs with the current presets and how many runs they use', async () => {
    await renderBoard([
      run({ id: 1, speechMs: 1000 }),
      run({ id: 2, speechMs: 1600 }),
      run({ id: 3, speechMs: 1200 }),
      run({ id: 4, speechMs: 9000, speechModel: 'another-model' }),
      run({ id: 5, speechMs: 9000, outcome: 'llm_failed' }),
    ])

    const typical = screen.getByTestId('speed-typical')
    expect(typical).toHaveTextContent('Median of 3 runs with the current presets')
    expect(within(typical).getByTestId('speed-typical-speech')).toHaveTextContent('1.2 s')
    expect(within(typical).getByTestId('speed-typical-ai')).toHaveTextContent('400 ms')
  })

  it('says so when no run used the current presets', async () => {
    await renderBoard([run({ aiModel: 'another-model' })])

    expect(screen.getByTestId('speed-typical')).toHaveTextContent(
      'No finished runs with the current presets yet.',
    )
  })

  it('gives the speech tip with a link to the speech guide when speech dominates', async () => {
    await renderBoard([
      run({ finishRecordingMs: 100, speechMs: 3000, aiMs: 300, pasteMs: 100, totalMs: 3500 }),
    ])

    const tip = screen.getByTestId('speed-tip')
    expect(tip).toHaveTextContent('Speech recognition is the slow part.')
    fireEvent.click(within(tip).getByRole('button', { name: 'See the speech guide' }))
    expect(openUrlSpy).toHaveBeenCalledWith(SPEECH_GUIDE_URL)
  })

  it('gives the AI tip when AI dominates and no tip when nothing stands out', async () => {
    await renderBoard([run({ speechMs: 500, aiMs: 1500, pasteMs: 100, totalMs: 2200 })])
    expect(screen.getByTestId('speed-tip')).toHaveTextContent('AI polish is the slow part.')
    cleanup()

    await renderBoard([run({ speechMs: 1000, totalMs: 1700 })])
    expect(screen.queryByTestId('speed-tip')).not.toBeInTheDocument()
  })

  it('gives the paste tip only when text is pasted from the clipboard', async () => {
    const config = useAppStore.getState().config
    useAppStore.setState({ config: { ...config, output_mode: 'clipboard' } })
    await renderBoard([run({ speechMs: 600, aiMs: 400, pasteMs: 450, totalMs: 1550 })])

    expect(screen.getByTestId('speed-tip')).toHaveTextContent('Pasting is slow')
  })

  it('adds a run from the timing event and ignores one it already has', async () => {
    await renderBoard([run({ id: 1 })])
    expect(runHandlers).toHaveLength(1)

    act(() => {
      runHandlers[0]({ payload: run({ id: 2, mode: 'translate', totalMs: 2500 }) })
      runHandlers[0]({ payload: run({ id: 2, mode: 'translate', totalMs: 2500 }) })
    })

    const last = screen.getByTestId('speed-last-run')
    expect(last).toHaveTextContent('Last run · Translate')
    expect(last).toHaveTextContent('2.5 s from stop to text')
    expect(within(last).getByTestId('speed-step-ai')).toHaveTextContent('AI translation')
    expect(screen.getByTestId('speed-typical')).toHaveTextContent(
      'Median of 2 runs with the current presets',
    )
  })

  it('stops listening when Home closes', async () => {
    await renderBoard([])
    cleanup()
    expect(unlistenSpy).toHaveBeenCalled()
  })
})
