import { writeFileSync } from 'node:fs'
import { act, cleanup, render } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { useTauriEvents } from '../src/hooks/useTauriEvents'
import { useRecording } from '../src/hooks/useRecording'
import { useAppStore } from '../src/stores/appStore'
import { waveformBenchmarks } from './waveform'
import { dictionaryBenchmarks } from './dictionary'

const bridge = vi.hoisted(() => {
  const dictionaryRowCalls = new Map([
    ['dictionary.editEntry', 0],
    ['dictionary.editCorrection', 0],
  ])
  return {
    listeners: new Map<string, (event: { payload: unknown }) => void>(),
    registrations: 0,
    dictionaryRowCalls,
    t: (key: string) => {
      const count = dictionaryRowCalls.get(key)
      if (count !== undefined) dictionaryRowCalls.set(key, count + 1)
      return key
    },
  }
})

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event: string, handler: (event: { payload: unknown }) => void) => {
    bridge.registrations++
    bridge.listeners.set(event, handler)
    return Promise.resolve(() => bridge.listeners.delete(event))
  }),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: bridge.t }) }))
vi.mock('../src/i18n', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }))
vi.mock('../src/components/toast-service', () => ({ toast: vi.fn() }))
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))

const VOLUME_EVENTS = 333
const TEXT_EVENTS = 128
const WARMUPS = 5
const SAMPLES = 15

test('measures recording, waveform and dictionary work through production components', async () => {
  const results = []
  for (const kind of ['events', 'recording', 'combined'] as const) {
    for (const workload of ['volume', 'text'] as const) {
      useAppStore.setState(useAppStore.getInitialState(), true)
      bridge.registrations = 0
      let renders = 0
      let state = 'idle'
      function EventsProbe() {
        useTauriEvents()
        renders++
        return null
      }
      function RecordingProbe() {
        state = useRecording().pipelineState
        renders++
        return null
      }
      function CombinedProbe() {
        useTauriEvents()
        state = useRecording().pipelineState
        renders++
        return null
      }
      const Probe = { events: EventsProbe, recording: RecordingProbe, combined: CombinedProbe }[
        kind
      ]
      await act(async () => {
        render(<Probe />)
      })
      const registrations = bridge.registrations
      const count = workload === 'volume' ? VOLUME_EVENTS : TEXT_EVENTS
      // The recording-only probe receives the same store actions the bridge invokes.
      const send = (index: number) => {
        const payload = workload === 'volume' ? (index + 1) / VOLUME_EVENTS : 'word '
        if (kind !== 'recording') {
          bridge.listeners.get(workload === 'volume' ? 'audio:volume' : 'llm:chunk')!({ payload })
        } else if (workload === 'volume') {
          useAppStore.getState().setAudioVolume(payload as number)
        } else {
          useAppStore.getState().appendPolishedChunk(payload as string)
        }
      }
      const samples = []
      const renderCounts = []
      for (let sample = -WARMUPS; sample < SAMPLES; sample++) {
        act(() => useAppStore.setState({ audioVolume: 0, polishedText: '' }))
        const before = renders
        const start = performance.now()
        for (let i = 0; i < count; i++) act(() => send(i))
        const elapsed = (performance.now() - start) * 1000
        if (sample >= 0) {
          samples.push(elapsed)
          renderCounts.push(renders - before)
        }
        if (workload === 'volume') expect(useAppStore.getState().audioVolume).toBe(1)
        else expect(useAppStore.getState().polishedText).toBe('word '.repeat(TEXT_EVENTS))
        expect(bridge.registrations).toBe(registrations)
      }
      if (kind !== 'events') {
        act(() => useAppStore.getState().setPipelineState('recording'))
        expect(state).toBe('recording')
      }
      cleanup()
      expect(bridge.listeners.size).toBe(0)
      results.push({
        id: `ui/${kind}/${workload}`,
        unit: 'us/batch',
        workload: { events: count, warmups: WARMUPS, samples: SAMPLES, mode: 'React dev/jsdom' },
        samples_us: samples,
        renders_per_batch: renderCounts,
        listener_registrations: registrations,
      })
    }
  }
  results.push(...waveformBenchmarks(WARMUPS, SAMPLES))
  results.push(
    ...dictionaryBenchmarks(WARMUPS, SAMPLES, (key) => bridge.dictionaryRowCalls.get(key) ?? 0),
  )
  writeFileSync(process.env.TYPELITE_BENCH_OUTPUT!, JSON.stringify(results))
})
