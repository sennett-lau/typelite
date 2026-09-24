import { describe, expect, it } from 'vitest'
import {
  capsuleAnchorForMonitor,
  capsuleOrigin,
  getCapsuleFocusable,
  getCapsuleVisibility,
  getSizeForState,
  pickMonitorForPoint,
} from '../useCapsuleResize'

describe('getCapsuleVisibility', () => {
  it('always hides the idle capsule', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'idle',
      }),
    ).toBe(false)
  })

  it('shows idle capsule when an error appears', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: true,
        pipelineState: 'idle',
      }),
    ).toBe(true)
  })

  it('shows active capsule while recording', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'recording',
      }),
    ).toBe(true)
  })

  it('keeps capsule visible while preparing', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'preparing',
      }),
    ).toBe(true)
  })

  it('keeps capsule visible while Ask is recording', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'ask_recording',
      }),
    ).toBe(true)
  })

  it('shows idle capsule while the context menu is open', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: true,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'idle',
      }),
    ).toBe(true)
  })

  it('keeps the capsule overlay from stealing keyboard output focus', () => {
    expect(getCapsuleFocusable()).toBe(false)
  })
})

describe('getSizeForState', () => {
  it('widens the recording capsule for the three language chips in Translate', () => {
    expect(getSizeForState('recording', false, false, false, 'translate')).toEqual({
      width: 296,
      height: 36,
    })
    expect(getSizeForState('recording', false, false, false, 'dictate')).toEqual({
      width: 216,
      height: 36,
    })
    expect(getSizeForState('recording', false, false, false)).toEqual({ width: 216, height: 36 })
    expect(getSizeForState('transcribing', false, false, false, 'translate')).toEqual({
      width: 216,
      height: 36,
    })
  })

  it('makes room for the waveform while Ask is recording', () => {
    expect(getSizeForState('ask_recording', false, false, false, 'ask')).toEqual({
      width: 248,
      height: 36,
    })
    expect(getSizeForState('ask_thinking', false, false, false, 'ask')).toEqual({
      width: 168,
      height: 36,
    })
  })

  it('keeps the context menu and error sizes ahead of the voice mode', () => {
    expect(getSizeForState('recording', false, false, true, 'translate')).toEqual({
      width: 220,
      height: 220,
    })
    expect(getSizeForState('recording', false, true, false, 'translate')).toEqual({
      width: 216,
      height: 36,
    })
  })
})

// Built-in Retina (2x) as primary, plus two 1x externals below it.
const retina = { position: { x: 0, y: 0 }, size: { width: 3024, height: 1964 }, scaleFactor: 2 }
const leftExternal = {
  position: { x: -1834, y: 982 },
  size: { width: 2560, height: 1440 },
  scaleFactor: 1,
}
const rightExternal = {
  position: { x: 726, y: 982 },
  size: { width: 2560, height: 1440 },
  scaleFactor: 1,
}
const monitors = [retina, leftExternal, rightExternal]

describe('capsule placement', () => {
  it('picks the monitor under a logical point across mixed scale factors', () => {
    expect(pickMonitorForPoint(monitors, { x: 700, y: 400 })).toBe(retina)
    expect(pickMonitorForPoint(monitors, { x: -1000, y: 1500 })).toBe(leftExternal)
    expect(pickMonitorForPoint(monitors, { x: 2000, y: 2000 })).toBe(rightExternal)
    expect(pickMonitorForPoint(monitors, { x: 99999, y: 99999 })).toBeUndefined()
  })

  it('anchors the capsule bottom-centre of the target monitor in logical points', () => {
    const anchor = capsuleAnchorForMonitor(retina, 224, 60)
    expect(anchor).toEqual({ left: 644, centerY: 872 })
    expect(capsuleOrigin(anchor, 60)).toEqual({ x: 644, y: 842 })

    const external = capsuleAnchorForMonitor(rightExternal, 224, 60)
    expect(capsuleOrigin(external, 60)).toEqual({ x: 1894, y: 2282 })
  })

  it('keeps the origin stable across repeated resizes', () => {
    const anchor = capsuleAnchorForMonitor(retina, 60, 60)
    const sizes = [60, 60, 60, 114, 60, 60]
    const origins = sizes.map((height) => capsuleOrigin(anchor, height))
    expect(new Set(origins.map((origin) => origin.x)).size).toBe(1)
    expect(origins.every((origin) => Number.isFinite(origin.y) && origin.y < 982)).toBe(true)
  })
})
