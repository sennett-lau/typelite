import { describe, expect, it } from 'vitest'
import { BUILTIN_SPEECH_PRESETS, type SpeechPreset } from '../../stores/appStore'
import {
  addressLabel,
  formatTestTime,
  isLocalAddress,
  speechServiceOf,
  speechTypeOf,
  withTemplate,
} from '../speechTypes'
import {
  formatMegabytes,
  formatSpeed,
  formatTimeLeft,
  progressPercent,
  secondsLeft,
  setupErrorMessage,
} from '../speechSetup'
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

describe('speech types (plan 0014)', () => {
  it('maps every shipped template onto its type and service', () => {
    const byId = Object.fromEntries(
      BUILTIN_SPEECH_PRESETS.map((p) => [p.id, [speechTypeOf(p), speechServiceOf(p)]]),
    )
    expect(byId['builtin-speech-local'][0]).toBe('local')
    expect(byId['builtin-speech-lan'][0]).toBe('local')
    expect(byId['builtin-speech-openai']).toEqual(['openai', 'openai'])
    expect(byId['builtin-speech-groq']).toEqual(['openai', 'groq'])
  })

  it('treats this Mac, the local network and Tailscale as local', () => {
    for (const url of [
      'http://127.0.0.1:8178/v1',
      'http://localhost:8000',
      'http://10.0.0.5:8000/v1',
      'http://192.168.1.20:8000/v1',
      'http://172.20.1.1/v1',
      'http://100.64.0.7:8000/v1',
      'http://my-pc:8000/v1',
      'http://studio.local:8000/v1',
      'https://pc.tail1234.ts.net/v1',
      'http://<computer-ip>:8000/v1',
      'http://192.0.2.10:8000/v1',
    ]) {
      expect(isLocalAddress(url), url).toBe(true)
    }
    for (const url of ['https://api.openai.com/v1', 'https://speech.example.com/v1', '']) {
      expect(isLocalAddress(url), url).toBe(false)
    }
  })

  it('a built-in preset is Built-in whatever its address', () => {
    expect(speechTypeOf(preset('', { kind: 'builtin' }))).toBe('builtin')
    expect(speechTypeOf(preset('https://api.openai.com/v1'))).toBe('openai')
    expect(speechServiceOf(preset('https://speech.example.com/v1'))).toBe('custom')
  })

  it('adds a missing template back when its type is picked', () => {
    const without = BUILTIN_SPEECH_PRESETS.filter((p) => p.id !== 'builtin-speech-groq')
    expect(withTemplate([...without], 'builtin-speech-groq').map((p) => p.id)).toContain(
      'builtin-speech-groq',
    )
    const all = [...BUILTIN_SPEECH_PRESETS]
    expect(withTemplate(all, 'builtin-speech-groq')).toBe(all)
  })

  it('formats names and times', () => {
    expect(addressLabel('http://192.0.2.10:8000/v1')).toBe('192.0.2.10')
    expect(formatTestTime(850)).toBe('850 ms')
    expect(formatTestTime(1400)).toBe('1.4 s')
  })
})

describe('Quick setup formatting (plan 0012)', () => {
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
    expect(formatTimeLeft(24, translate)).toBe('24 s left')
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
