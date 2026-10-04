import { createHash } from 'node:crypto'
import { cleanup, render } from '@testing-library/react'
import { expect } from 'vitest'
import { Waveform } from '../src/components/Capsule/Waveform'
import { useAppStore } from '../src/stores/appStore'

interface Frame {
  at: number
  volume?: number
}

const FRAME_MS = 1000 / 60
const HIDDEN_MS = 12 * 60 * 60 * 1000

// One level update per two frames approximates the microphone's 30 Hz events. The varying
// fixture alternates syllable-sized peaks with pauses; it is synthetic, not recorded audio.
function voiceLevel(frame: number): number {
  if (frame % 180 >= 100) return 0
  return 0.008 + 0.18 * (0.5 + 0.5 * Math.sin(frame / 7))
}

const workloads = [
  {
    id: 'silence',
    frames: Array.from({ length: 600 }, (_, i): Frame => ({
      at: (i + 1) * FRAME_MS,
      volume: i % 2 === 0 ? 0 : undefined,
    })),
    hidden_ms: 0,
  },
  {
    id: 'voice-and-pauses',
    frames: Array.from({ length: 600 }, (_, i): Frame => ({
      at: (i + 1) * FRAME_MS,
      volume: i % 2 === 0 ? voiceLevel(i) : undefined,
    })),
    hidden_ms: 0,
  },
  {
    id: 'hidden-resume',
    frames: [
      { at: HIDDEN_MS, volume: 0.08 },
      ...Array.from({ length: 120 }, (_, i): Frame => ({
        at: HIDDEN_MS + (i + 1) * FRAME_MS,
        volume: i % 2 === 0 ? voiceLevel(i) : undefined,
      })),
    ],
    hidden_ms: HIDDEN_MS,
  },
]

/** One pending frame is the component's contract; no browser clock or timer runs alongside it. */
function installFrameClock() {
  const requestDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame')
  const cancelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame')
  let nextId = 0
  let pending: { id: number; callback: FrameRequestCallback } | null = null
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      if (pending) throw new Error('Waveform scheduled more than one animation frame')
      pending = { id: ++nextId, callback }
      return nextId
    },
  })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (id: number) => {
      if (pending?.id === id) pending = null
    },
  })
  return {
    tick(at: number) {
      const frame = pending
      if (!frame) throw new Error('Waveform stopped scheduling animation frames')
      pending = null
      frame.callback(at)
    },
    hasPending: () => pending !== null,
    restore() {
      if (requestDescriptor) {
        Object.defineProperty(globalThis, 'requestAnimationFrame', requestDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'requestAnimationFrame')
      }
      if (cancelDescriptor) {
        Object.defineProperty(globalThis, 'cancelAnimationFrame', cancelDescriptor)
      } else {
        Reflect.deleteProperty(globalThis, 'cancelAnimationFrame')
      }
    },
  }
}

/** Forward native jsdom setters without retaining per-call mock arguments. */
function installStyleCounter() {
  const properties = ['transform', 'opacity'] as const
  const descriptors = properties.map((property) => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, property)
    if (!descriptor?.set) throw new Error(`Missing CSS ${property} setter`)
    return descriptor
  })
  let targets = new Set<CSSStyleDeclaration>()
  let counts = { transform: 0, opacity: 0 }
  for (const [index, property] of properties.entries()) {
    const descriptor = descriptors[index]
    Object.defineProperty(CSSStyleDeclaration.prototype, property, {
      ...descriptor,
      set(this: CSSStyleDeclaration, value: string) {
        if (targets.has(this)) counts[property]++
        descriptor.set!.call(this, value)
      },
    })
  }
  return {
    start(bars: HTMLDivElement[]) {
      targets = new Set(bars.map((bar) => bar.style))
      counts = { transform: 0, opacity: 0 }
    },
    stop() {
      targets.clear()
      return { ...counts }
    },
    restore() {
      for (const [index, property] of properties.entries()) {
        Object.defineProperty(CSSStyleDeclaration.prototype, property, descriptors[index])
      }
    },
  }
}

function barStyles(bars: HTMLDivElement[]) {
  return bars.map((bar) => `${bar.style.transform}/${bar.style.opacity}`).join('|')
}

/** Actual production animation callbacks; mounting, initial frame, snapshots and checks are untimed. */
export function waveformBenchmarks(warmups: number, samples: number) {
  const clock = installFrameClock()
  let counter: ReturnType<typeof installStyleCounter> | undefined
  const results = []
  try {
    counter = installStyleCounter()
    for (const workload of workloads) {
      let trajectorySha = ''
      let finalStyles = ''
      const elapsedSamples = []
      const writes = []
      for (let sample = -warmups - 1; sample < samples; sample++) {
        useAppStore.setState(useAppStore.getInitialState(), true)
        const view = render(<Waveform />)
        const bars = Array.from(view.getByTestId('waveform').children) as HTMLDivElement[]
        expect(bars).toHaveLength(18)
        // Establish last-frame time and initial styles without charging mount work to the batch.
        clock.tick(0)
        const validation = sample === -warmups - 1
        const trajectory = validation ? createHash('sha256') : null
        counter.start(bars)
        const start = performance.now()
        for (const frame of workload.frames) {
          if (frame.volume !== undefined) useAppStore.getState().setAudioVolume(frame.volume)
          clock.tick(frame.at)
          // This entire pass is validation only and never enters the timing samples.
          trajectory?.update(barStyles(bars)).update('\n')
        }
        const elapsed = (performance.now() - start) * 1000
        const counts = counter.stop()
        if (validation) {
          trajectorySha = trajectory!.digest('hex')
          finalStyles = barStyles(bars)
        } else {
          expect(barStyles(bars)).toBe(finalStyles)
          if (sample >= 0) {
            elapsedSamples.push(elapsed)
            writes.push(counts)
          }
        }
        view.unmount()
        expect(clock.hasPending()).toBe(false)
        cleanup()
      }
      results.push({
        id: `ui/waveform/${workload.id}`,
        unit: 'us/batch',
        workload: {
          frames: workload.frames.length,
          volume_events: workload.frames.filter((frame) => frame.volume !== undefined).length,
          frame_interval_ms: FRAME_MS,
          hidden_ms: workload.hidden_ms,
          untimed_initial_frames: 1,
          warmups,
          samples,
          mode: 'React dev/jsdom; controlled RAF; real CSS setters',
        },
        samples_us: elapsedSamples,
        style_writes_per_batch: writes,
        trajectory_sha256: trajectorySha,
      })
    }
    return results
  } finally {
    try {
      cleanup()
    } finally {
      counter?.restore()
      clock.restore()
      useAppStore.setState(useAppStore.getInitialState(), true)
    }
  }
}
