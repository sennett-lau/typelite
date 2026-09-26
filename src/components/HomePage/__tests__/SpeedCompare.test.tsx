/**
 * Plan `typing-speed-and-nudge`: the "Speaking · Typing · N× faster" row at the top of Insights.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { translate } from '../../../test-utils/i18nMock'
import * as tauri from '../../../lib/tauri'
import type { SpeedSummary } from '../../../lib/speedStats'
import { SpeedCompare } from '../SpeedCompare'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}))

vi.mock('../../../lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/tauri')>()),
  getSpeedStats: vi.fn(),
}))

type StatsHandler = (event: { payload: SpeedSummary }) => void
const statsHandlers: StatsHandler[] = []

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: StatsHandler) => {
    if (event === 'speed:stats') statsHandlers.push(handler)
    return Promise.resolve(() => {})
  }),
}))

async function renderRow(summary: SpeedSummary) {
  vi.mocked(tauri.getSpeedStats).mockResolvedValue(summary)
  render(<SpeedCompare />)
  await act(async () => {})
}

beforeEach(() => {
  statsHandlers.length = 0
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SpeedCompare', () => {
  it('shows dashes and no badge before there is data', async () => {
    await renderRow({ speakingWpm: null, typingWpm: null, timesFaster: null })
    expect(screen.getByTestId('speed-speaking')).toHaveTextContent('Speaking—')
    expect(screen.getByTestId('speed-typing')).toHaveTextContent('Typing—')
    expect(screen.queryByTestId('speed-faster')).toBeNull()
    expect(screen.queryByText('WPM')).toBeNull()
  })

  it('shows the side that has data and hides the badge until both do', async () => {
    await renderRow({ speakingWpm: 141.6, typingWpm: null, timesFaster: null })
    expect(screen.getByTestId('speed-speaking')).toHaveTextContent('Speaking142WPM')
    expect(screen.getByTestId('speed-typing')).toHaveTextContent('Typing—')
    expect(screen.queryByTestId('speed-faster')).toBeNull()
  })

  it('compares both speeds with a badge', async () => {
    await renderRow({ speakingWpm: 142, typingWpm: 48, timesFaster: 2.958 })
    expect(screen.getByTestId('speed-speaking')).toHaveTextContent('142WPM')
    expect(screen.getByTestId('speed-typing')).toHaveTextContent('48WPM')
    expect(screen.getByTestId('speed-faster')).toHaveTextContent('3.0×faster than typing')
  })

  it('follows updates from the backend', async () => {
    await renderRow({ speakingWpm: null, typingWpm: null, timesFaster: null })
    act(() => {
      statsHandlers.forEach((handler) =>
        handler({ payload: { speakingWpm: 120, typingWpm: 40, timesFaster: 3 } }),
      )
    })
    expect(screen.getByTestId('speed-speaking')).toHaveTextContent('120WPM')
    expect(screen.getByTestId('speed-faster')).toHaveTextContent('3.0×')
  })
})
