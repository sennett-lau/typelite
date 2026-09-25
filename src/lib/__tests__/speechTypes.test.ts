import { describe, expect, it } from 'vitest'
import { BUILTIN_SPEECH_PRESETS, type SpeechPreset } from '../../stores/appStore'
import {
  addressHost,
  addressHostname,
  builtinWhisperPreset,
  engineOf,
  formatTestTime,
  serverPresets,
} from '../speechTypes'
import {
  defaultModelChoice,
  formatMegabytes,
  formatSpeed,
  formatTimeLeft,
  hardwareNote,
  progressPercent,
  secondsLeft,
  setupErrorMessage,
} from '../speechSetup'
import type { SpeechHardwareCheck } from '../tauri'
import { translate } from '../../test-utils/i18nMock'
import { IDLE_SETUP_STATUS } from '../../stores/speechSetupStore'

function preset(base_url: string, extra: Partial<SpeechPreset> = {}): SpeechPreset {
  return {
    id: 'p',
    name: 'P',
    base_url,
    model: 'm',
    language: 'auto',
    builtin: false,
    verified_at: null,
    ...extra,
  }
}

const GB = 1024 ** 3

function check(
  models: string[],
  leftOut: SpeechHardwareCheck['offer']['leftOut'] = null,
  neededBytes: number | null = null,
): SpeechHardwareCheck {
  return {
    hardware: {
      chipKind: 'apple_silicon',
      chipName: 'Apple M1 Pro',
      memoryBytes: 32 * GB,
      freeBytes: 250_000_000,
    },
    offer: {
      models: models.map((id, index) => ({
        id,
        sizeBytes: 1,
        recommended: index === 0 && models.length > 1,
      })),
      leftOut,
      neededBytes,
    },
  }
}

describe('speech engines (plan `two-tab-speech`)', () => {
  it('ships only the Built-in preset, and tells the two engines apart', () => {
    expect(BUILTIN_SPEECH_PRESETS.map((p) => p.id)).toEqual(['builtin-speech-this-mac'])
    const builtin = BUILTIN_SPEECH_PRESETS[0]
    expect(engineOf(builtin)).toBe('builtin')
    expect(engineOf(preset('https://api.openai.com/v1'))).toBe('server')

    const presets = [preset('http://192.0.2.10:8000/v1'), { ...builtin }]
    expect(builtinWhisperPreset(presets)?.id).toBe('builtin-speech-this-mac')
    expect(serverPresets(presets).map((p) => p.base_url)).toEqual(['http://192.0.2.10:8000/v1'])
  })

  it('names a preset after its host and formats test times', () => {
    expect(addressHostname('https://api.openai.com/v1')).toBe('api.openai.com')
    expect(addressHostname('http://192.0.2.10:8000/v1')).toBe('192.0.2.10')
    expect(addressHostname('not a url')).toBe('')
    expect(addressHost('http://192.0.2.10:8000/v1')).toBe('192.0.2.10:8000')
    expect(formatTestTime(850)).toBe('850 ms')
    expect(formatTestTime(1400)).toBe('1.4 s')
  })

  it('selects the preferred model when offered, otherwise the first', () => {
    expect(defaultModelChoice(check(['large-v3-turbo', 'small']))).toBe('large-v3-turbo')
    expect(defaultModelChoice(check(['large-v3-turbo', 'small']), 'small')).toBe('small')
    expect(defaultModelChoice(check(['small']), 'large-v3-turbo')).toBe('small')
    expect(defaultModelChoice(check([]))).toBeNull()
    expect(defaultModelChoice(null)).toBeNull()
  })

  it('words the hardware note', () => {
    expect(hardwareNote(check(['large-v3-turbo', 'small']), translate, 'long')).toBe(
      'This Mac: Apple M1 Pro, 32 GB memory.',
    )
    expect(hardwareNote(check(['small'], 'needs_memory'), translate, 'long')).toBe(
      'This Mac: Apple M1 Pro, 32 GB memory. The larger model needs 8 GB of memory.',
    )
    expect(hardwareNote(check(['small'], 'needs_apple_silicon'), translate, 'short')).toBe(
      'Apple M1 Pro · 32 GB · The larger model needs an Apple Silicon Mac.',
    )
    expect(hardwareNote(check([], null, 209_094_035), translate, 'long')).toBe(
      'Not enough free space for a model: 0.2 GB needed, 0.3 GB free.',
    )
    expect(hardwareNote(null, translate, 'long')).toBe('')
  })
})

describe('Quick setup formatting (plan `quick-speech-setup`)', () => {
  const downloading = {
    ...IDLE_SETUP_STATUS,
    phase: 'downloading' as const,
    downloadedBytes: 100_000_000,
    totalBytes: 574_041_195,
    bytesPerSecond: 20_000_000,
  }

  it('shows sizes in MB and the speed', () => {
    expect(formatMegabytes(574_041_195)).toBe('574 MB')
    expect(formatMegabytes(190_085_487)).toBe('190 MB')
    expect(formatSpeed(20_000_000)).toBe('20 MB/s')
    expect(formatSpeed(2_345_000)).toBe('2.3 MB/s')
  })

  it('works out percent and time left', () => {
    expect(progressPercent(downloading)).toBe(17)
    expect(secondsLeft(downloading)).toBe(24)
    expect(formatTimeLeft(24, translate)).toBe('about 24 s left')
    expect(formatTimeLeft(600, translate)).toBe('about 10 min left')
    expect(secondsLeft({ ...downloading, bytesPerSecond: 0 })).toBeNull()
    expect(formatTimeLeft(null, translate)).toBeNull()
    expect(progressPercent({ ...downloading, totalBytes: 0 })).toBe(0)
  })

  it('words each error as behaviour.md says', () => {
    expect(setupErrorMessage({ code: 'network', reason: 'offline' }, translate)).toBe(
      'Could not download the model: offline. Check your connection and try again.',
    )
    expect(
      setupErrorMessage(
        { code: 'disk_space', neededBytes: 1_500_000_000, availableBytes: 250_000_000 },
        translate,
      ),
    ).toBe('Need 1.5 GB free to download the model; 0.3 GB available.')
    expect(setupErrorMessage({ code: 'checksum' }, translate)).toBe(
      'The downloaded file was damaged, so it was deleted. Try again.',
    )
    expect(setupErrorMessage({ code: 'load', reason: 'odd reason' }, translate)).toBe(
      'Could not load the speech model: odd reason. Try the smaller model.',
    )
  })
})
