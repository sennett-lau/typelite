import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapsuleAskThinking } from '../CapsuleAskThinking'
import { useAppStore } from '../../../stores/appStore'
import { answerSegments } from '../../AskPanel/liveSearch'

vi.mock('../../../lib/tauri', () => ({ abortAskDictation: vi.fn() }))
vi.mock('react-i18next', async () => {
  const { translate } = await import('../../../test-utils/i18nMock')
  return { useTranslation: () => ({ t: translate }) }
})

afterEach(() => {
  cleanup()
  useAppStore.setState({ askStage: 'thinking' })
})

// Plan `ask-web-search`.
describe('Ask pill while searching and following up', () => {
  it('says "Searching the web…" while Ask searches, then "Thinking"', () => {
    useAppStore.setState({ askStage: 'searching' })
    render(<CapsuleAskThinking />)
    expect(screen.getByText('Searching the web…')).toBeDefined()

    act(() => useAppStore.setState({ askStage: 'thinking' }))
    expect(screen.getByText('Thinking')).toBeDefined()
    expect(screen.queryByText('Searching the web…')).toBeNull()
  })
})

describe('answerSegments', () => {
  it('turns known [n] citations into numbers and keeps the rest as text', () => {
    expect(answerSegments('A [1]. B [2][3]. C [1, 3]. D [9].', [1, 2, 3])).toEqual([
      'A ',
      1,
      '. B ',
      2,
      3,
      '. C ',
      1,
      3,
      '. D [9].',
    ])
    expect(answerSegments('No citations', [1])).toEqual(['No citations'])
  })
})
