import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../stores/appStore'
import { LevelHistory, WAVEFORM_BARS } from '../../../lib/waveform'
import { Waveform } from '../Waveform'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('framer-motion', () => ({ useReducedMotion: () => motion.reduced }))

const pending = new Map<number, FrameRequestCallback>()
let nextFrameId = 0

beforeEach(() => {
  motion.reduced = false
  pending.clear()
  nextFrameId = 0
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++nextFrameId, callback)
    return nextFrameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function frame(at: number, volume?: number) {
  if (volume !== undefined) useAppStore.getState().setAudioVolume(volume)
  expect(pending.size).toBe(1)
  const [id, callback] = [...pending.entries()][0]
  pending.delete(id)
  act(() => callback(at))
}

function bars(container: HTMLElement) {
  return Array.from(
    container.querySelector('[data-testid="waveform"]')!.children,
  ) as HTMLDivElement[]
}

function styles(elements: HTMLDivElement[]) {
  return elements.map((bar) => [bar.style.transform, bar.style.opacity])
}

describe('recording waveform', () => {
  it('keeps every silent frame flat without repeatedly writing identical styles', () => {
    const transform = vi.spyOn(CSSStyleDeclaration.prototype, 'transform', 'set')
    const opacity = vi.spyOn(CSSStyleDeclaration.prototype, 'opacity', 'set')
    const view = render(<Waveform />)
    const elements = bars(view.container)
    expect(elements).toHaveLength(WAVEFORM_BARS)
    frame(0)
    transform.mockClear()
    opacity.mockClear()

    const silentStyles = Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(0.231)', '0.4'])
    for (let i = 1; i <= 600; i++) {
      frame((i * 1000) / 60, 0)
      expect(styles(elements)).toEqual(silentStyles)
    }
    expect(transform).not.toHaveBeenCalled()
    expect(opacity).not.toHaveBeenCalled()
  })

  it('moves new speech from the newest bar toward the left and settles back to silence', () => {
    const view = render(<Waveform />)
    const elements = bars(view.container)
    frame(0, 1)
    frame(33)
    expect(styles(elements).slice(0, -1)).toEqual(
      Array.from({ length: WAVEFORM_BARS - 1 }, () => ['scaleY(0.231)', '0.4']),
    )
    expect(styles(elements)[WAVEFORM_BARS - 1]).toEqual(['scaleY(0.663)', '0.74'])
    const beforeParentRender = styles(elements)
    view.rerender(<Waveform />)
    expect(styles(elements)).toEqual(beforeParentRender)
    expect(pending.size).toBe(1)

    frame(66)
    expect(styles(elements).slice(-2)).toEqual([
      ['scaleY(0.663)', '0.74'],
      ['scaleY(0.852)', '0.88'],
    ])
    frame(1000)
    expect(styles(elements)).toEqual(
      Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(1.000)', '1']),
    )
    frame(2000, 0)
    frame(4000)
    expect(styles(elements)).toEqual(
      Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(0.231)', '0.4']),
    )
  })

  it('keeps fractional frame time across the 33 ms sampling boundary', () => {
    const pushed = vi.spyOn(LevelHistory.prototype, 'push')
    const view = render(<Waveform />)
    const elements = bars(view.container)
    frame(0, 1)
    frame(32.75)
    expect(pushed).not.toHaveBeenCalled()
    expect(elements[16].style.transform).toBe('scaleY(0.231)')
    expect(elements[17].style.transform).not.toBe('scaleY(0.231)')

    frame(33)
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(elements[17].style.transform).toBe('scaleY(0.663)')
    frame(33.5)
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(elements[16].style.transform).not.toBe('scaleY(0.231)')
    frame(65.999)
    expect(pushed).toHaveBeenCalledTimes(1)
    frame(66)
    expect(pushed).toHaveBeenCalledTimes(2)
  })

  it('bounds catch-up after a long hidden-window pause and cancels the resumed loop', () => {
    const pushed = vi.spyOn(LevelHistory.prototype, 'push')
    const view = render(<Waveform />)
    const elements = bars(view.container)
    frame(0, 1)
    const resumeAt = 12 * 60 * 60 * 1000 + 0.25
    frame(resumeAt)
    expect(pushed).toHaveBeenCalledTimes(WAVEFORM_BARS)
    expect(styles(elements)).toEqual(
      Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(1.000)', '1']),
    )
    // Twelve hours leaves 30 ms, plus the fractional 0.25 ms, in the sampling interval.
    frame(resumeAt + 2.5)
    expect(pushed).toHaveBeenCalledTimes(WAVEFORM_BARS)
    frame(resumeAt + 2.75)
    expect(pushed).toHaveBeenCalledTimes(WAVEFORM_BARS + 1)
    view.unmount()
    expect(pending.size).toBe(0)
  })

  it('uses static reduced-motion bars and starts and stops one loop when that preference changes', () => {
    motion.reduced = true
    const view = render(<Waveform />)
    const elements = bars(view.container)
    const reducedStyles = Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(0.5)', '0.8'])
    expect(styles(elements)).toEqual(reducedStyles)
    expect(pending.size).toBe(0)

    motion.reduced = false
    view.rerender(<Waveform />)
    frame(0, 1)
    frame(33)
    expect(elements[17].style.transform).toBe('scaleY(0.663)')
    motion.reduced = true
    view.rerender(<Waveform />)
    expect(styles(elements)).toEqual(reducedStyles)
    expect(pending.size).toBe(0)

    motion.reduced = false
    view.rerender(<Waveform />)
    frame(100, 0)
    expect(styles(elements)).toEqual(
      Array.from({ length: WAVEFORM_BARS }, () => ['scaleY(0.231)', '0.4']),
    )
    view.unmount()
    expect(pending.size).toBe(0)
  })
})
