import { describe, expect, it } from 'vitest'
import { formatDone, formatSize, noModelSuits, setupErrorMessage, setupKey } from '../speechSetup'
import { hardwareCheck } from '../../test-utils/speechHardware'
import { translate } from '../../test-utils/i18nMock'

describe('built-in setup helpers (plan `ai-polish-setup`)', () => {
  it('shows sizes in MB below a gigabyte and in GB above', () => {
    expect(formatSize(574_041_195)).toBe('574 MB')
    expect(formatSize(2_497_281_120)).toBe('2.5 GB')
    expect(formatDone(241_000_000, 574_041_195)).toBe('241')
    expect(formatDone(1_000_000_000, 2_497_281_120)).toBe('1.0')
  })

  it('knows when no built-in model can run', () => {
    expect(noModelSuits(null)).toBe(false)
    expect(noModelSuits(hardwareCheck(['qwen3-1.7b']))).toBe(false)
    expect(noModelSuits(hardwareCheck([]))).toBe(true)
    expect(noModelSuits(hardwareCheck(['qwen3-4b'], { serverAvailable: false }))).toBe(true)
  })

  it('AI texts fall back to the speech wording', () => {
    expect(setupKey('speechSetup', 'testing')).toBe('speechSetup.testing')
    expect(setupKey('aiSetup', 'testing')).toEqual(['aiSetup.testing', 'speechSetup.testing'])
    expect(translate(setupKey('aiSetup', 'cancel'))).toBe('Cancel')
    expect(translate(setupKey('aiSetup', 'testing'))).toBe('Starting the model and running a test…')
  })

  it('words a missing server and an AI load error', () => {
    expect(setupErrorMessage({ code: 'server_missing' }, translate, 'aiSetup')).toContain(
      'without the built-in AI server',
    )
    expect(
      setupErrorMessage({ code: 'load', reason: 'The model did not answer' }, translate, 'aiSetup'),
    ).toBe('The model did not answer')
  })
})
