import { describe, expect, it } from 'vitest'
import {
  capsuleAnchorForMonitor,
  capsuleOrigin,
  copyPillSize,
  cursorLogicalPoint,
  getCapsuleFocusable,
  getCapsuleState,
  getCapsuleVisibility,
  ASK_RECORDING_SIZE,
  ASK_RECORDING_WITH_SELECTION_SIZE,
  getPillSize,
  getSizeForState,
  growFirstSize,
  NO_TRANSLATE_LANGUAGE,
  monitorKey,
  pickFollowTarget,
  pickMonitorForPoint,
  translateRecordingSize,
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
  const size = (width: number) => ({ width, height: 40 })

  it('uses the plan `translate-pill-and-keys` sizes while recording', () => {
    expect(getSizeForState('recording', false, false, false, 'dictate')).toEqual(size(160))
    expect(getSizeForState('recording', false, false, false)).toEqual(size(160))
    expect(getSizeForState('ask_recording', false, false, false, 'ask')).toEqual(size(160))
  })

  it('sizes Translate recording for its language name and dots', () => {
    const translate = (nameWidth: number | null, dots: number) =>
      getSizeForState('recording', false, false, false, 'translate', false, { nameWidth, dots })
    // Fixed parts 140 + slack 8, the name after an 8 pt gap, the dots (6 pt, 4 apart) likewise.
    expect(translate(48, 0)).toEqual(size(204))
    expect(translate(48, 2)).toEqual(size(228))
    expect(translate(48, 3)).toEqual(size(238))
    // Fractional widths round up, so the text is never cut by a pixel.
    expect(translate(47.2, 0)).toEqual(size(204))
    // A long name is capped at 180 pt (it scrolls inside that).
    expect(translate(300, 3)).toEqual(size(370))
    expect(translate(180, 0)).toEqual(size(336))
    // No language chosen: no name, the Dictate size.
    expect(translate(null, 0)).toEqual(size(160))
    expect(translateRecordingSize(NO_TRANSLATE_LANGUAGE)).toEqual(size(160))
    // Dictate ignores the Translate metrics.
    expect(
      getSizeForState('recording', false, false, false, 'dictate', false, {
        nameWidth: 300,
        dots: 3,
      }),
    ).toEqual(size(160))
  })

  it('uses one short working size for every working state and the done flash', () => {
    for (const state of [
      'preparing',
      'transcribing',
      'polishing',
      'outputting',
      'ask_thinking',
    ] as const) {
      expect(getSizeForState(state, false, false, false, 'translate')).toEqual(size(140))
    }
    expect(
      getSizeForState('idle', false, false, false, null, false, NO_TRANSLATE_LANGUAGE, true),
    ).toEqual(size(140))
    expect(getSizeForState('idle', false, false, false)).toEqual(size(40))
  })

  it('keeps the context menu and error sizes ahead of the voice mode', () => {
    expect(getSizeForState('recording', false, false, true, 'translate')).toEqual({
      width: 220,
      height: 220,
    })
    expect(getSizeForState('recording', false, true, false, 'translate')).toEqual(size(224))
  })

  it('keeps the pill visible during the done flash', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'idle',
        doneFlash: true,
      }),
    ).toBe(true)
  })
})

describe('Copy pill (plan `copy-when-no-field`)', () => {
  const long = {
    text: 'A result that is much too long for the short pill to show.',
    targetLang: null,
  }
  const short = { text: 'See you at 4.', targetLang: null }

  it('is one line, 40 pt high and 308 or 368 pt wide by the length of the result', () => {
    expect(copyPillSize(short)).toEqual({ width: 308, height: 40 })
    expect(copyPillSize(long)).toEqual({ width: 368, height: 40 })
    // CJK characters are wide, and a language tag takes room too.
    expect(
      copyPillSize({ text: '我哋聽日下晝四點喺二樓會議室開會啦。', targetLang: null }).width,
    ).toBe(368)
    expect(copyPillSize({ text: 'Thirty-two characters, near end.', targetLang: null }).width).toBe(
      308,
    )
    expect(copyPillSize({ text: 'Thirty-two characters, near end.', targetLang: 'ja' }).width).toBe(
      368,
    )
    expect(getPillSize('copy', null, false, NO_TRANSLATE_LANGUAGE, short)).toEqual({
      width: 308,
      height: 40,
    })
  })

  it('shows once the pipeline is idle, behind errors and the done flash', () => {
    expect(getCapsuleState('idle', false, false, true)).toBe('copy')
    expect(getCapsuleState('idle', true, false, true)).toBe('error')
    expect(getCapsuleState('idle', false, true, true)).toBe('done')
    expect(getCapsuleState('recording', false, false, true)).toBe('recording')
    expect(getCapsuleState('idle', false, false, false)).toBe('idle')
  })

  it('keeps the window visible and sized for the pill', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'idle',
        copyPill: true,
      }),
    ).toBe(true)
    expect(
      getSizeForState('idle', false, false, false, null, false, NO_TRANSLATE_LANGUAGE, false, long),
    ).toEqual({
      width: 368,
      height: 40,
    })
    // The context menu and an error still win.
    expect(
      getSizeForState('idle', false, false, true, null, false, NO_TRANSLATE_LANGUAGE, false, long),
    ).toEqual({
      width: 220,
      height: 220,
    })
    expect(
      getSizeForState('idle', false, true, false, null, false, NO_TRANSLATE_LANGUAGE, false, long),
    ).toEqual({
      width: 224,
      height: 40,
    })
  })
})

describe('window resize order (plan `copy-when-no-field`)', () => {
  it('switching to a shorter language name shrinks the window only after the pill', () => {
    const windowFor = (nameWidth: number) => {
      const pill = getSizeForState('recording', false, false, false, 'translate', false, {
        nameWidth,
        dots: 2,
      })
      return { width: pill.width + 24, height: pill.height + 24 }
    }
    // Longer name: the window grows at once, before the pill animates wider.
    expect(growFirstSize(windowFor(44), windowFor(210))).toBeNull()
    // Shorter name: the window keeps its width until the pill animated narrower.
    expect(growFirstSize(windowFor(210), windowFor(44))).toEqual(windowFor(210))
  })

  it('grows at once when nothing shrinks', () => {
    expect(growFirstSize({ width: 156, height: 60 }, { width: 384, height: 60 })).toBeNull()
    expect(growFirstSize({ width: 156, height: 60 }, { width: 156, height: 60 })).toBeNull()
  })

  it('keeps a shrinking dimension until the pill animated smaller, growing the other', () => {
    expect(growFirstSize({ width: 384, height: 60 }, { width: 156, height: 60 })).toEqual({
      width: 384,
      height: 60,
    })
    expect(growFirstSize({ width: 244, height: 244 }, { width: 384, height: 60 })).toEqual({
      width: 384,
      height: 244,
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

describe('pill follows the cursor screen', () => {
  const onRetina = monitorKey(retina)

  it('stays put while the cursor is on the anchored monitor', () => {
    expect(pickFollowTarget(monitors, { x: 700, y: 400 }, onRetina)).toBeUndefined()
    expect(pickFollowTarget(monitors, { x: 1511, y: 981 }, onRetina)).toBeUndefined()
  })

  it('moves to the monitor under the cursor when it differs', () => {
    expect(pickFollowTarget(monitors, { x: -1000, y: 1500 }, onRetina)).toBe(leftExternal)
    expect(pickFollowTarget(monitors, { x: 2000, y: 2000 }, onRetina)).toBe(rightExternal)
    expect(pickFollowTarget(monitors, { x: 700, y: 400 }, monitorKey(rightExternal))).toBe(retina)
  })

  it('stays put when the cursor is on no monitor', () => {
    expect(pickFollowTarget(monitors, { x: 99999, y: 99999 }, onRetina)).toBeUndefined()
    // The gap right of the Retina display, above the right external.
    expect(pickFollowTarget(monitors, { x: 2000, y: 500 }, onRetina)).toBeUndefined()
  })

  it('moves when nothing is anchored yet', () => {
    expect(pickFollowTarget(monitors, { x: 700, y: 400 }, null)).toBe(retina)
  })

  it('reads the cursor in logical points using the primary scale', () => {
    // Physical cursor on the Retina primary (2x) lands on the right external once converted.
    const point = cursorLogicalPoint({ x: 4000, y: 4000 }, 2)
    expect(point).toEqual({ x: 2000, y: 2000 })
    expect(pickFollowTarget(monitors, point, onRetina)).toBe(rightExternal)
    expect(cursorLogicalPoint({ x: 10, y: 20 }, undefined)).toEqual({ x: 10, y: 20 })
  })

  it('re-anchors bottom-centre of the new monitor with the original window size', () => {
    const moved = capsuleAnchorForMonitor(rightExternal, 174, 60)
    // Right external: logical x 726..3286, y 982..2422.
    expect(moved.left).toBe(Math.round(726 + 1280 - 87))
    expect(capsuleOrigin(moved, 60).y).toBe(2422 - 80 - 60)
  })
})

// Plan `ask-panel-above-pill`: the Ask pill widens for its highlight chip.
describe('Ask pill with a highlight', () => {
  it('is wider while listening with a highlight, at the same height', () => {
    expect(getPillSize('ask_recording', 'ask', false, NO_TRANSLATE_LANGUAGE)).toEqual(
      ASK_RECORDING_SIZE,
    )
    expect(getPillSize('ask_recording', 'ask', false, NO_TRANSLATE_LANGUAGE, null, true)).toEqual(
      ASK_RECORDING_WITH_SELECTION_SIZE,
    )
    expect(ASK_RECORDING_WITH_SELECTION_SIZE.width).toBeGreaterThan(ASK_RECORDING_SIZE.width)
    expect(ASK_RECORDING_WITH_SELECTION_SIZE.height).toBe(ASK_RECORDING_SIZE.height)
    expect(
      getSizeForState(
        'ask_recording',
        false,
        false,
        false,
        'ask',
        false,
        NO_TRANSLATE_LANGUAGE,
        false,
        null,
        true,
      ),
    ).toEqual(ASK_RECORDING_WITH_SELECTION_SIZE)
  })

  it('does not change the thinking pill', () => {
    expect(getPillSize('ask_thinking', 'ask', false, NO_TRANSLATE_LANGUAGE, null, true)).toEqual(
      getPillSize('ask_thinking', 'ask', false, NO_TRANSLATE_LANGUAGE),
    )
  })
})
