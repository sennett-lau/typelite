import { describe, expect, it } from 'vitest'
import {
  ASK_SEARCHING_PILL_SIZE,
  capsuleAnchorForMonitor,
  capsuleOrigin,
  copyPillSize,
  cursorLogicalPoint,
  monitorWorkAreaRect,
  PILL_BOTTOM_GAP,
  PILL_HEIGHT,
  getCapsuleFocusable,
  getCapsuleState,
  getCapsuleVisibility,
  ASK_RECORDING_SIZE,
  ASK_RECORDING_WITH_SELECTION_SIZE,
  DICTATION_RECORDING_SIZE,
  ERROR_PILL_SIZE,
  QUIET_PILL_SIZE,
  getPillSize,
  getSizeForState,
  growFirstSize,
  NO_TRANSLATE_LANGUAGE,
  NUDGE_PILL_SIZE,
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
  const size = (width: number) => ({ width, height: 32 })

  it('uses the plan `translate-pill-and-keys` sizes while recording', () => {
    expect(getSizeForState('recording', false, false, false, 'dictate')).toEqual(size(160))
    expect(getSizeForState('recording', false, false, false)).toEqual(size(160))
    expect(getSizeForState('ask_recording', false, false, false, 'ask')).toEqual(size(160))
  })

  it('sizes Translate recording for its language name and dots', () => {
    const translate = (nameWidth: number | null, dots: number) =>
      getSizeForState('recording', false, false, false, 'translate', false, { nameWidth, dots })
    // Fixed parts 140 + slack 8, the name after an 8 pt gap, the dots (5 pt, 4 apart) likewise.
    expect(translate(48, 0)).toEqual(size(204))
    expect(translate(48, 2)).toEqual(size(226))
    expect(translate(48, 3)).toEqual(size(236))
    // Odd widths round up to even, so the centred pill sits on whole points.
    // Fractional widths round up, so the text is never cut by a pixel.
    expect(translate(47.2, 0)).toEqual(size(204))
    // A long name is capped at 180 pt (it scrolls inside that).
    expect(translate(300, 3)).toEqual(size(368))
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
    expect(getSizeForState('idle', false, false, false)).toEqual(size(32))
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

  it('is one line, 32 pt high and 308 or 368 pt wide by the length of the result', () => {
    expect(copyPillSize(short)).toEqual({ width: 308, height: 32 })
    expect(copyPillSize(long)).toEqual({ width: 368, height: 32 })
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
      height: 32,
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
      height: 32,
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
      height: 32,
    })
  })
})

describe('typing nudge (plan `typing-speed-and-nudge`)', () => {
  it('shows only while idle, behind errors, the done flash and the Copy pill', () => {
    expect(getCapsuleState('idle', false, false, false, true)).toBe('nudge')
    expect(getCapsuleState('idle', true, false, false, true)).toBe('error')
    expect(getCapsuleState('idle', false, true, false, true)).toBe('done')
    expect(getCapsuleState('idle', false, false, true, true)).toBe('copy')
    expect(getCapsuleState('recording', false, false, false, true)).toBe('recording')
  })

  it('keeps the window visible and sized for the one-line toast', () => {
    expect(
      getCapsuleVisibility({
        contextMenuOpen: false,
        capsuleExpanded: false,
        hasError: false,
        pipelineState: 'idle',
        typingNudge: true,
      }),
    ).toBe(true)
    expect(getPillSize('nudge', null, false, NO_TRANSLATE_LANGUAGE)).toEqual(NUDGE_PILL_SIZE)
    expect(
      getSizeForState(
        'idle',
        false,
        false,
        false,
        null,
        false,
        NO_TRANSLATE_LANGUAGE,
        false,
        null,
        false,
        true,
      ),
    ).toEqual(NUDGE_PILL_SIZE)
  })
})

describe('calm fade (plan `quiet-no-speech`)', () => {
  const quiet = (pipelineState: Parameters<typeof getSizeForState>[0], hasError = false) =>
    getSizeForState(
      pipelineState,
      false,
      hasError,
      false,
      'dictate',
      false,
      NO_TRANSLATE_LANGUAGE,
      false,
      null,
      false,
      false,
      true,
    )

  it('shows once the pipeline is idle, behind errors and the done flash', () => {
    expect(getCapsuleState('idle', false, false, false, false, true)).toBe('quiet')
    expect(getCapsuleState('idle', true, false, false, false, true)).toBe('error')
    expect(getCapsuleState('idle', false, true, false, false, true)).toBe('done')
    // Ahead of the Copy pill and the typing nudge (a new run closes those anyway).
    expect(getCapsuleState('idle', false, false, true, true, true)).toBe('quiet')
    expect(getCapsuleState('idle', false, false, false, false, false)).toBe('idle')
  })

  it('always gives way to a live run', () => {
    // Dictate reports no speech while still transcribing and goes idle just after.
    for (const state of ['preparing', 'recording', 'ask_recording', 'transcribing'] as const) {
      expect(getCapsuleState(state, false, false, false, false, true)).toBe(state)
    }
  })

  it('keeps the pill visible while it shows', () => {
    const idle = {
      contextMenuOpen: false,
      capsuleExpanded: false,
      hasError: false,
      pipelineState: 'idle' as const,
    }
    expect(getCapsuleVisibility({ ...idle, quietFade: true })).toBe(true)
    expect(getCapsuleVisibility({ ...idle, quietFade: false })).toBe(false)
  })

  it('is 104 × 32 pt; an error or a live run keeps its own size', () => {
    expect(QUIET_PILL_SIZE).toEqual({ width: 104, height: PILL_HEIGHT })
    expect(getPillSize('quiet', 'dictate', false, NO_TRANSLATE_LANGUAGE)).toEqual(QUIET_PILL_SIZE)
    expect(quiet('idle')).toEqual(QUIET_PILL_SIZE)
    expect(quiet('idle', true)).toEqual(ERROR_PILL_SIZE)
    expect(quiet('recording')).toEqual(DICTATION_RECORDING_SIZE)
  })

  it('shrinks the window only after the pill narrowed from the working pill', () => {
    const windowFor = ({ width, height }: { width: number; height: number }) => ({
      width: width + 24,
      height: height + 24,
    })
    const working = windowFor(getSizeForState('transcribing', false, false, false, 'dictate'))
    expect(growFirstSize(working, windowFor(quiet('idle')))).toEqual(working)
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
    // No work area reported: the whole screen. The pill's bottom sits 16 pt above its edge.
    const anchor = capsuleAnchorForMonitor(retina)
    expect(anchor).toEqual({ centerX: 756, centerY: 982 - 16 - 16 })
    expect(capsuleOrigin(anchor, 224, 56)).toEqual({ x: 644, y: 922 })

    const external = capsuleAnchorForMonitor(rightExternal)
    expect(capsuleOrigin(external, 224, 56)).toEqual({ x: 1894, y: 2422 - 16 - 32 - 12 })
  })

  it('keeps the pill centred on the screen whatever its width', () => {
    const anchor = capsuleAnchorForMonitor(retina)
    // Idle, a working pill, a wide Translate pill, the Copy pill: every centre is the screen's.
    for (const width of [64, 164, 280, 384]) {
      const origin = capsuleOrigin(anchor, width, 56)
      expect(origin.x + width / 2).toBe(756)
    }
    const heights = [56, 56, 56, 114, 56, 56]
    const origins = heights.map((height) => capsuleOrigin(anchor, 164, height))
    expect(new Set(origins.map((origin) => origin.x)).size).toBe(1)
    expect(origins.every((origin) => Number.isFinite(origin.y) && origin.y < 982)).toBe(true)
  })
})

/** The pill's bottom edge for an anchor (the window is the pill plus 12 pt padding). */
function pillBottom(anchor: { centerY: number }): number {
  return anchor.centerY + PILL_HEIGHT / 2
}

// The owner's report: on screens without the Dock the pill sat far too high, because one
// fixed 80 pt bottom offset (sized for a Dock) was used everywhere.
describe('capsule placement on the work area', () => {
  // Retina (2x) with the menu bar (25 pt) and a 70 pt Dock at the bottom, in physical pixels.
  const dockBottom = {
    ...retina,
    workArea: { position: { x: 0, y: 50 }, size: { width: 3024, height: 1964 - 50 - 140 } },
  }

  it('sits just above a Dock at the bottom', () => {
    const area = monitorWorkAreaRect(dockBottom)
    expect(area).toEqual({ x: 0, y: 25, width: 1512, height: 887 })
    const anchor = capsuleAnchorForMonitor(dockBottom)
    expect(pillBottom(anchor)).toBe(912 - PILL_BOTTOM_GAP)
    expect(anchor.centerX).toBe(756)
  })

  it('sits near the bottom edge without a Dock, with an auto-hidden Dock and in full screen', () => {
    // An external screen: only its own menu bar. An auto-hidden Dock or a full-screen Space
    // report the whole screen (or all of it but the menu bar) as the work area.
    const noDock = {
      ...retina,
      workArea: { position: { x: 0, y: 50 }, size: { width: 3024, height: 1914 } },
    }
    const fullScreen = { ...retina, workArea: { position: { x: 0, y: 0 }, size: retina.size } }
    for (const monitor of [noDock, fullScreen, retina]) {
      const anchor = capsuleAnchorForMonitor(monitor)
      expect(pillBottom(anchor)).toBe(982 - PILL_BOTTOM_GAP)
      expect(anchor.centerX).toBe(756)
    }
  })

  it('centres on the work area when the Dock is on the left or right', () => {
    // A 70 pt Dock on the left: the work area starts at x 70.
    const dockLeft = {
      ...retina,
      workArea: { position: { x: 140, y: 50 }, size: { width: 3024 - 140, height: 1914 } },
    }
    const left = capsuleAnchorForMonitor(dockLeft)
    expect(left.centerX).toBe(Math.round(70 + 721))
    expect(pillBottom(left)).toBe(982 - PILL_BOTTOM_GAP)

    const dockRight = {
      ...retina,
      workArea: { position: { x: 0, y: 50 }, size: { width: 3024 - 140, height: 1914 } },
    }
    const right = capsuleAnchorForMonitor(dockRight)
    expect(right.centerX).toBe(Math.round(721))
    expect(pillBottom(right)).toBe(982 - PILL_BOTTOM_GAP)
  })

  it('converts each work area with its own monitor scale (mixed Retina and 1x)', () => {
    // The 1x external below the Retina: its menu bar is 25 physical pixels, no Dock.
    const external = {
      ...rightExternal,
      workArea: { position: { x: 726, y: 982 + 25 }, size: { width: 2560, height: 1440 - 25 } },
    }
    expect(monitorWorkAreaRect(external)).toEqual({ x: 726, y: 1007, width: 2560, height: 1415 })
    const onExternal = capsuleAnchorForMonitor(external)
    expect(pillBottom(onExternal)).toBe(2422 - PILL_BOTTOM_GAP)
    expect(onExternal.centerX).toBe(726 + 1280)

    // The same Dock-at-the-bottom work area on the 2x Retina lands in points, not pixels.
    expect(pillBottom(capsuleAnchorForMonitor(dockBottom))).toBe(896)
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
    const moved = capsuleAnchorForMonitor(rightExternal)
    // Right external: logical x 726..3286, y 982..2422. The pill's bottom is 16 pt above the
    // bottom edge; the window adds 12 pt of padding below it.
    expect(moved.centerX).toBe(Math.round(726 + 1280))
    expect(capsuleOrigin(moved, 174, 56)).toEqual({ x: 726 + 1280 - 87, y: 2422 - 16 - 32 - 12 })
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

  it('widens the thinking pill while Ask searches the web (plan ask-web-search)', () => {
    const thinking = getPillSize('ask_thinking', 'ask', false, NO_TRANSLATE_LANGUAGE)
    const searching = getPillSize('ask_searching', 'ask', false, NO_TRANSLATE_LANGUAGE)
    expect(searching).toEqual(ASK_SEARCHING_PILL_SIZE)
    expect(searching.width).toBeGreaterThan(thinking.width)
    expect(searching.height).toBe(thinking.height)
  })

  it('does not change the thinking pill', () => {
    expect(getPillSize('ask_thinking', 'ask', false, NO_TRANSLATE_LANGUAGE, null, true)).toEqual(
      getPillSize('ask_thinking', 'ask', false, NO_TRANSLATE_LANGUAGE),
    )
  })
})
