import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useRecording } from '../useRecording'
import { useAppStore } from '../../stores/appStore'

describe('useRecording subscriptions', () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))
  afterEach(cleanup)

  it('ignores live audio and text updates but follows pipeline transitions', () => {
    const { result } = renderHook(() => useRecording())
    const idle = result.current
    act(() => useAppStore.getState().setAudioVolume(0.5))
    act(() => useAppStore.getState().appendPolishedChunk('hello'))
    expect(result.current).toBe(idle)

    act(() => useAppStore.getState().setPipelineState('recording'))
    expect(result.current.isRecording).toBe(true)
    expect(result.current.isIdle).toBe(false)
    act(() => useAppStore.getState().setPipelineState('polishing'))
    expect(result.current.isRecording).toBe(false)
    expect(result.current.isProcessing).toBe(true)
  })
})
