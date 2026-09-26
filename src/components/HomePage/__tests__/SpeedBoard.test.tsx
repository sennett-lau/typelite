import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import { makeRun } from '../../../test-utils/runTiming'
import { useAppStore } from '../../../stores/appStore'
import { SPEECH_GUIDE_URL, type RunTiming } from '../../../lib/speed'
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

function run(overrides: Partial<RunTiming> = {}): RunTiming {
  return makeRun(overrides)
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

describe('SpeedBoard (Insights)', () => {
  it('shows the empty state before the first run', async () => {
    await renderBoard([])

    const board = screen.getByRole('region', { name: 'Insights' })
    expect(within(board).getByTestId('speed-empty')).toHaveTextContent(
      'Dictate once to see where the time goes.',
    )
    expect(screen.queryByTestId('speed-average')).not.toBeInTheDocument()
  })

  it('says no run has finished when every run failed', async () => {
    await renderBoard([run({ outcome: 'stt_unreachable', aiMs: null, pasteMs: null })])

    expect(screen.getByTestId('speed-empty')).toHaveTextContent('No run has finished yet.')
  })

  it('draws the average of all finished runs across presets as three steps', async () => {
    await renderBoard([
      run({ id: 1, speechMs: 1000, aiMs: 300, pasteMs: 100 }),
      run({ id: 2, speechMs: 2000, aiMs: 500, pasteMs: 300, speechPresetId: 'other' }),
      run({ id: 3, speechMs: 9000, outcome: 'llm_failed' }),
    ])

    const average = screen.getByTestId('speed-average')
    expect(average).toHaveTextContent('Average')
    expect(average).toHaveTextContent('2 runs across all presets')
    // 1500 + 400 + 200 = 2100.
    expect(average).toHaveTextContent('2.1 s from stop to text')
    expect(within(average).getByTestId('speed-step-speech')).toHaveTextContent(
      'Speech recognition1.5 s',
    )
    expect(within(average).getByTestId('speed-step-ai')).toHaveTextContent('AI polish400 ms')
    expect(within(average).getByTestId('speed-step-paste')).toHaveTextContent('Paste200 ms')
    expect(within(average).queryByTestId('speed-step-recording')).not.toBeInTheDocument()
    expect(average).not.toHaveTextContent('Finish recording')
    expect(screen.queryByText(/Last run/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Typical/)).not.toBeInTheDocument()

    expect(within(average).getByTestId('speed-segment-speech').style.width).toBe(
      `${(1500 / 2100) * 100}%`,
    )
    expect(within(average).getByTestId('speed-segment-ai').style.background).toBe(
      'var(--color-step-ai)',
    )
    expect(within(average).getByRole('img')).toHaveAttribute(
      'aria-label',
      'Speech recognition 1.5 s, AI polish 400 ms, Paste 200 ms',
    )
  })

  it('says "1 run" for a single run and shows a dash for a step that never ran', async () => {
    await renderBoard([run({ aiMs: null, pasteMs: 600 })])

    const average = screen.getByTestId('speed-average')
    expect(within(average).getByTestId('speed-run-count')).toHaveTextContent(
      '1 run across all presets',
    )
    expect(within(average).getByTestId('speed-step-ai')).toHaveTextContent('AI polish—')
    expect(within(average).queryByTestId('speed-segment-ai')).not.toBeInTheDocument()
  })

  it('gives the speech tip with a link to the speech guide when speech dominates', async () => {
    await renderBoard([run({ speechMs: 3000, aiMs: 300, pasteMs: 100 })])

    const tip = screen.getByTestId('speed-tip')
    expect(tip).toHaveTextContent('Speech recognition is the slow part.')
    fireEvent.click(within(tip).getByRole('button', { name: 'See the speech guide' }))
    expect(openUrlSpy).toHaveBeenCalledWith(SPEECH_GUIDE_URL)
  })

  it('gives the AI tip when AI dominates and no tip when nothing stands out', async () => {
    await renderBoard([run({ speechMs: 500, aiMs: 1500, pasteMs: 100 })])
    expect(screen.getByTestId('speed-tip')).toHaveTextContent('AI polish is the slow part.')
    cleanup()

    await renderBoard([run({ speechMs: 1000, aiMs: 600, pasteMs: 200 })])
    expect(screen.queryByTestId('speed-tip')).not.toBeInTheDocument()
  })

  it('gives the paste tip only when text is pasted from the clipboard', async () => {
    const config = useAppStore.getState().config
    useAppStore.setState({ config: { ...config, output_mode: 'clipboard' } })
    await renderBoard([run({ speechMs: 600, aiMs: 400, pasteMs: 450 })])

    expect(screen.getByTestId('speed-tip')).toHaveTextContent('Pasting is slow')
  })

  it('adds a run from the timing event and ignores one it already has', async () => {
    await renderBoard([run({ id: 1, speechMs: 1000 })])
    expect(runHandlers).toHaveLength(1)

    act(() => {
      runHandlers[0]({ payload: run({ id: 2, mode: 'translate', speechMs: 2000 }) })
      runHandlers[0]({ payload: run({ id: 2, mode: 'translate', speechMs: 2000 }) })
    })

    const average = screen.getByTestId('speed-average')
    expect(average).toHaveTextContent('2 runs across all presets')
    expect(within(average).getByTestId('speed-step-speech')).toHaveTextContent('1.5 s')
  })

  it('stops listening when Home closes', async () => {
    await renderBoard([])
    cleanup()
    expect(unlistenSpy).toHaveBeenCalled()
  })
})
