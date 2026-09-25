import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '../useCountdown'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('expires once after the duration and reports the time left', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useCountdown(8000, true, onExpire))
    expect(result.current.progress()).toBe(1)

    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.progress()).toBeCloseTo(0.75)
    act(() => vi.advanceTimersByTime(6000))
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(result.current.progress()).toBe(0)
    act(() => vi.advanceTimersByTime(10_000))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('keeps the remaining time while paused', () => {
    const onExpire = vi.fn()
    const { result, rerender } = renderHook(
      ({ running }) => useCountdown(8000, running, onExpire),
      { initialProps: { running: true } },
    )
    act(() => vi.advanceTimersByTime(4000))
    rerender({ running: false })
    act(() => vi.advanceTimersByTime(60_000))
    expect(onExpire).not.toHaveBeenCalled()
    expect(result.current.progress()).toBeCloseTo(0.5)

    rerender({ running: true })
    act(() => vi.advanceTimersByTime(3999))
    expect(onExpire).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('starts over for a new reset key', () => {
    const onExpire = vi.fn()
    const { rerender } = renderHook(({ key }) => useCountdown(8000, true, onExpire, key), {
      initialProps: { key: 'a' },
    })
    act(() => vi.advanceTimersByTime(7000))
    rerender({ key: 'b' })
    act(() => vi.advanceTimersByTime(7000))
    expect(onExpire).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1000))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })
})
