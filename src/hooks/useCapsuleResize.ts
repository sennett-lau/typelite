import { useEffect, useRef, type RefObject } from 'react'
import { useAppStore, type CopyOffer, type PipelineState, type VoiceMode } from '../stores/appStore'
import { NAME_MAX_WIDTH, useTranslatePill } from '../components/Capsule/translatePill'
import { WAVEFORM_BARS } from '../lib/waveform'

export interface CapsuleSize {
  width: number
  height: number
}

// Pill sizes from plan `translate-pill-and-keys` (pill.md): every state is 40 pt high. The window
// adds 12 pt of padding on each side.

/** Height of every pill state. */
export const PILL_HEIGHT = 40

/** Dictate recording: red dot, 18-bar waveform and cancel button. */
export const DICTATION_RECORDING_SIZE: CapsuleSize = { width: 160, height: PILL_HEIGHT }
/** Ask recording: Ask icon, waveform and cancel button. */
export const ASK_RECORDING_SIZE: CapsuleSize = { width: 160, height: PILL_HEIGHT }

/** Size of each language dot and the space between dots. */
const LANGUAGE_DOT = 6
const LANGUAGE_DOT_GAP = 4
/**
 * The fixed parts of a recording pill: 14 pt left padding, 8 pt dot, the waveform (2 pt bars
 * 2 pt apart), 20 pt cancel button, 12 pt right padding and the 8 pt gaps between them.
 */
const RECORDING_FIXED_WIDTH = 14 + 8 + 8 + (WAVEFORM_BARS * 4 - 2) + 8 + 20 + 12
/** A little air before the cancel button, as the Dictate pill has. */
const TRANSLATE_SLACK = 8

/** What the Translate recording pill's width depends on (plan `translate-pill-and-keys`). */
export interface TranslatePillMetrics {
  /** Natural width of the active language's name; null when no language is chosen. */
  nameWidth: number | null
  /** Number of language dots (0 with fewer than two languages). */
  dots: number
}

export const NO_TRANSLATE_LANGUAGE: TranslatePillMetrics = { nameWidth: null, dots: 0 }

/**
 * The Translate recording pill: the fixed parts, plus the name (at most `NAME_MAX_WIDTH`) and
 * the dots, each after an 8 pt gap. Never narrower than the Dictate pill.
 */
export function translateRecordingSize({ nameWidth, dots }: TranslatePillMetrics): CapsuleSize {
  let width = RECORDING_FIXED_WIDTH + TRANSLATE_SLACK
  if (nameWidth !== null) width += Math.min(Math.ceil(nameWidth), NAME_MAX_WIDTH) + 8
  if (dots > 0) width += dots * LANGUAGE_DOT + (dots - 1) * LANGUAGE_DOT_GAP + 8
  return { width: Math.max(DICTATION_RECORDING_SIZE.width, width), height: PILL_HEIGHT }
}
/**
 * Working states (preparing, transcribing, polishing, pasting, Ask thinking) and the done
 * flash: a short label over the aurora sweep.
 */
export const WORKING_PILL_SIZE: CapsuleSize = { width: 140, height: PILL_HEIGHT }
/** An error message (icon and one line). */
export const ERROR_PILL_SIZE: CapsuleSize = { width: 224, height: PILL_HEIGHT }
/** A setup message ("Set up speech recognition first") with its "Set up" button. */
export const SETUP_ERROR_SIZE: CapsuleSize = { width: 320, height: PILL_HEIGHT }
/**
 * Plan `copy-when-no-field`: the Copy pill (language tag, one-line preview, Copy button) for a
 * short result.
 */
export const COPY_PILL_SHORT_SIZE: CapsuleSize = { width: 308, height: PILL_HEIGHT }
/** The Copy pill for a longer result; its preview ends with an ellipsis. */
export const COPY_PILL_SIZE: CapsuleSize = { width: 368, height: PILL_HEIGHT }
const IDLE_SIZE: CapsuleSize = { width: PILL_HEIGHT, height: PILL_HEIGHT }

/** Up to this visual length (CJK characters count double) a result fits the short Copy pill. */
const COPY_PILL_SHORT_TEXT = 34

/** Rough visual length of `text`: wide (CJK, Hangul, fullwidth) characters count as two. */
function visualLength(text: string): number {
  let length = 0
  for (const char of text) {
    length += (char.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1
    if (length > COPY_PILL_SHORT_TEXT * 2) break
  }
  return length
}

/** The Copy pill's size: short results get the narrower pill (the language tag takes room too). */
export function copyPillSize(offer: CopyOffer | null): CapsuleSize {
  if (!offer) return COPY_PILL_SIZE
  const tag = offer.targetLang ? 4 : 0
  return visualLength(offer.text.trim()) + tag <= COPY_PILL_SHORT_TEXT
    ? COPY_PILL_SHORT_SIZE
    : COPY_PILL_SIZE
}

/**
 * Plan `copy-when-no-field` transitions. The pill's width, height and corners animate for
 * `PILL_RESIZE_MS`
 * (CSS on `.pill`); hiding slides it down and fades it for `PILL_HIDE_MS`. The window grows at
 * once and shrinks only after the pill has animated narrower, so nothing is clipped.
 */
export const PILL_RESIZE_MS = 280
export const PILL_HIDE_MS = 220

/**
 * The pill's own size (without the context menu or window padding) for a capsule state.
 * `capsuleState` is the pipeline state, `error`, `done` (the brief flash after pasting) or
 * `copy` (the Copy pill, sized by `copyOffer`).
 */
export function getPillSize(
  capsuleState: string,
  activeVoiceMode: VoiceMode | null,
  errorHasAction: boolean,
  translate: TranslatePillMetrics,
  copyOffer: CopyOffer | null = null,
): CapsuleSize {
  switch (capsuleState) {
    case 'copy':
      return copyPillSize(copyOffer)
    case 'error':
      return errorHasAction ? SETUP_ERROR_SIZE : ERROR_PILL_SIZE
    case 'recording':
      if (activeVoiceMode !== 'translate') return DICTATION_RECORDING_SIZE
      return translateRecordingSize(translate)
    case 'ask_recording':
      return ASK_RECORDING_SIZE
    case 'preparing':
    case 'transcribing':
    case 'polishing':
    case 'outputting':
    case 'ask_thinking':
    case 'done':
      return WORKING_PILL_SIZE
    default:
      return IDLE_SIZE
  }
}

export interface CapsuleVisibilityInput {
  contextMenuOpen: boolean
  capsuleExpanded: boolean
  hasError: boolean
  pipelineState: PipelineState
  /** The brief done flash after pasting keeps the pill up a moment longer. */
  doneFlash?: boolean
  /** Plan `copy-when-no-field`: the Copy pill offers a result. */
  copyPill?: boolean
}

/** The idle capsule is always hidden; it shows only while working, or for an error or menu. */
export function getCapsuleVisibility({
  contextMenuOpen,
  capsuleExpanded,
  hasError,
  pipelineState,
  doneFlash = false,
  copyPill = false,
}: CapsuleVisibilityInput): boolean {
  return (
    contextMenuOpen ||
    capsuleExpanded ||
    hasError ||
    doneFlash ||
    copyPill ||
    pipelineState !== 'idle'
  )
}

/**
 * The state the pill shows: an error first, then the done flash or the Copy pill once the
 * pipeline is idle, else the pipeline state.
 */
export function getCapsuleState(
  pipelineState: string,
  hasError: boolean,
  doneFlash: boolean,
  copyPill = false,
): string {
  if (hasError) return 'error'
  if (doneFlash && pipelineState === 'idle') return 'done'
  if (copyPill && pipelineState === 'idle') return 'copy'
  return pipelineState
}

export function getCapsuleFocusable(): boolean {
  return false
}

const CAPSULE_BOTTOM_MARGIN = 80

interface MonitorGeometry {
  position: { x: number; y: number }
  size: { width: number; height: number }
  scaleFactor: number
}

interface LogicalRect {
  x: number
  y: number
  width: number
  height: number
}

/** Left edge and vertical centre of the capsule window, in global logical points. */
export interface CapsuleAnchor {
  left: number
  centerY: number
}

// Monitor geometry arrives in physical pixels scaled by that monitor's own factor,
// so each monitor converts with its own scaleFactor to land in one logical space.
export function monitorLogicalRect(monitor: MonitorGeometry): LogicalRect {
  const scale = monitor.scaleFactor || 1
  return {
    x: monitor.position.x / scale,
    y: monitor.position.y / scale,
    width: monitor.size.width / scale,
    height: monitor.size.height / scale,
  }
}

export function pickMonitorForPoint<T extends MonitorGeometry>(
  monitors: T[],
  point: { x: number; y: number },
): T | undefined {
  return monitors.find((monitor) => {
    const rect = monitorLogicalRect(monitor)
    return (
      point.x >= rect.x &&
      point.x < rect.x + rect.width &&
      point.y >= rect.y &&
      point.y < rect.y + rect.height
    )
  })
}

/** Identifies a monitor by its logical rectangle (stable while the layout does not change). */
export function monitorKey(monitor: MonitorGeometry): string {
  const rect = monitorLogicalRect(monitor)
  return `${rect.x},${rect.y},${rect.width},${rect.height}`
}

/**
 * The cursor in global logical points. Tauri's `cursorPosition()` is scaled by the primary
 * monitor's factor, whatever monitor the cursor is on.
 */
export function cursorLogicalPoint(
  cursor: { x: number; y: number },
  primaryScale: number | undefined,
): { x: number; y: number } {
  const scale = primaryScale || 1
  return { x: cursor.x / scale, y: cursor.y / scale }
}

/**
 * While the pill is up it follows the cursor's screen. Returns the monitor to move to, or
 * `undefined` to stay: the cursor is still on the anchored monitor, or on no monitor at all
 * (for example in a gap between screens).
 */
export function pickFollowTarget<T extends MonitorGeometry>(
  monitors: T[],
  cursor: { x: number; y: number },
  anchoredMonitorKey: string | null,
): T | undefined {
  const target = pickMonitorForPoint(monitors, cursor)
  if (!target || monitorKey(target) === anchoredMonitorKey) return undefined
  return target
}

/** How often the visible pill checks which screen the cursor is on. */
export const FOLLOW_POLL_MS = 250
/** Each half of the fade when the pill moves to another screen. */
export const FOLLOW_FADE_MS = 120

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

function fadeTo(element: HTMLElement, opacity: number): Promise<void> {
  element.style.transition = `opacity ${FOLLOW_FADE_MS}ms ease`
  element.style.opacity = String(opacity)
  return new Promise((resolve) => setTimeout(resolve, FOLLOW_FADE_MS))
}

export function capsuleAnchorForMonitor(
  monitor: MonitorGeometry,
  windowWidth: number,
  windowHeight: number,
): CapsuleAnchor {
  const rect = monitorLogicalRect(monitor)
  return {
    left: Math.round(rect.x + rect.width / 2 - windowWidth / 2),
    centerY: Math.round(rect.y + rect.height - CAPSULE_BOTTOM_MARGIN - windowHeight / 2),
  }
}

export function capsuleOrigin(anchor: CapsuleAnchor, windowHeight: number) {
  return { x: anchor.left, y: Math.round(anchor.centerY - windowHeight / 2) }
}

export function getSizeForState(
  state: PipelineState,
  expanded: boolean,
  hasError: boolean,
  contextMenuOpen: boolean,
  activeVoiceMode: VoiceMode | null = null,
  errorHasAction = false,
  translate: TranslatePillMetrics = NO_TRANSLATE_LANGUAGE,
  doneFlash = false,
  copyOffer: CopyOffer | null = null,
): CapsuleSize {
  if (contextMenuOpen) return { width: 220, height: 220 }
  if (hasError) return getPillSize('error', activeVoiceMode, errorHasAction, translate)
  if (expanded) return { width: 220, height: 90 }
  const capsuleState = getCapsuleState(state, false, doneFlash, copyOffer !== null)
  return getPillSize(capsuleState, activeVoiceMode, errorHasAction, translate, copyOffer)
}

/**
 * The window size to set first when the window goes from `current` to `next`: any dimension
 * that grows grows at once, one that shrinks keeps its size until the pill has animated
 * smaller. Returns null when nothing shrinks (the next size can be set directly).
 */
export function growFirstSize(current: CapsuleSize, next: CapsuleSize): CapsuleSize | null {
  if (next.width >= current.width && next.height >= current.height) return null
  return {
    width: Math.max(current.width, next.width),
    height: Math.max(current.height, next.height),
  }
}

/**
 * Sizes, places and shows the capsule window. `doneFlash` is true during the done flash.
 * While the pill is visible it follows the cursor to another screen, fading `fadeTarget`
 * out and in around the move. The window grows before the pill animates larger and shrinks
 * after it animated smaller, and it hides only after the pill's hide animation (plan `copy-when-no-
 * field`).
 */
export function useCapsuleResize(doneFlash = false, fadeTarget?: RefObject<HTMLElement | null>) {
  const pipelineState = useAppStore((s) => s.pipelineState)
  const capsuleExpanded = useAppStore((s) => s.capsuleExpanded)
  const pipelineError = useAppStore((s) => s.pipelineError)
  const errorHasAction = useAppStore((s) => s.pipelineErrorAction !== null)
  const contextMenuOpen = useAppStore((s) => s.contextMenuOpen)
  const activeVoiceMode = useAppStore((s) => s.activeVoiceMode)
  const setContextMenuReady = useAppStore((s) => s.setContextMenuReady)
  // The Translate pill's width follows the active language's name (plan
  // `translate-pill-and-keys`); switching language resizes the window like any state change.
  const translatePill = useTranslatePill()
  const translateNameWidth = translatePill.nameWidth
  const translateDots = translatePill.dots
  const copyOffer = useAppStore((s) => s.copyOffer)
  const anchor = useRef<CapsuleAnchor | null>(null)
  /** The monitor the pill is anchored to, and the window size the anchor was computed for. */
  const anchorMonitor = useRef<string | null>(null)
  const anchorSize = useRef<CapsuleSize>({ width: 0, height: 0 })
  const windowHeightNow = useRef(0)
  const windowSizeNow = useRef<CapsuleSize>({ width: 0, height: 0 })
  const visible = useRef(false)
  /** Counts window updates; a waiting update gives up when a newer one was scheduled. */
  const generation = useRef(0)
  /** Ends the current wait early (a newer update is waiting in the queue). */
  const wake = useRef<() => void>(() => {})
  const queue = useRef<Promise<void>>(Promise.resolve())
  const followQueued = useRef(false)

  const hasError = pipelineError !== null
  const shouldShow = getCapsuleVisibility({
    contextMenuOpen,
    capsuleExpanded,
    hasError,
    pipelineState,
    doneFlash,
    copyPill: copyOffer !== null,
  })

  useEffect(() => {
    const size = getSizeForState(
      pipelineState,
      capsuleExpanded,
      hasError,
      contextMenuOpen,
      activeVoiceMode,
      errorHasAction,
      { nameWidth: translateNameWidth, dots: translateDots },
      doneFlash,
      copyOffer,
    )
    const windowWidth = size.width + 24
    const windowHeight = size.height + 24
    const myGeneration = ++generation.current
    wake.current()

    /** Waits `ms`; false when a newer update arrived meanwhile (it then does the work). */
    const pause = (ms: number) =>
      new Promise<boolean>((resolve) => {
        if (generation.current !== myGeneration) return resolve(false)
        const timer = setTimeout(() => resolve(generation.current === myGeneration), ms)
        wake.current = () => {
          clearTimeout(timer)
          resolve(false)
        }
      })

    const run = async () => {
      if (generation.current !== myGeneration) return
      const {
        getCurrentWindow,
        LogicalSize,
        LogicalPosition,
        availableMonitors,
        primaryMonitor,
        cursorPosition,
      } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      await win.setFocusable(getCapsuleFocusable()).catch(() => {})

      // Re-anchor whenever the capsule appears so it follows the screen being worked on.
      const appearing = shouldShow && !visible.current
      if (!anchor.current || appearing) {
        const monitors = await availableMonitors().catch(() => [])
        const primary = await primaryMonitor().catch(() => null)
        const cursor = await cursorPosition().catch(() => null)
        const target =
          (cursor &&
            pickMonitorForPoint(monitors, cursorLogicalPoint(cursor, primary?.scaleFactor))) ||
          primary ||
          monitors[0]
        if (target) {
          anchor.current = capsuleAnchorForMonitor(target, windowWidth, windowHeight)
          anchorMonitor.current = monitorKey(target)
          anchorSize.current = { width: windowWidth, height: windowHeight }
        }
      }

      const applySize = async (width: number, height: number) => {
        windowHeightNow.current = height
        windowSizeNow.current = { width, height }
        await win.setSize(new LogicalSize(width, height)).catch(() => {})
        if (anchor.current) {
          // Left edge and vertical centre stay fixed. Content is padded 12px each side,
          // so the mic icon never moves while the capsule grows or shrinks.
          const origin = capsuleOrigin(anchor.current, height)
          await win.setPosition(new LogicalPosition(origin.x, origin.y)).catch(() => {})
        }
      }

      // Hiding: keep the window while the pill slides down and fades out.
      if (!shouldShow && visible.current && !(await pause(PILL_HIDE_MS))) return

      // Shrinking while visible: grow what grows now, shrink the rest after the pill animated.
      const next = { width: windowWidth, height: windowHeight }
      const first =
        shouldShow && visible.current && !appearing && !prefersReducedMotion()
          ? growFirstSize(windowSizeNow.current, next)
          : null
      if (first) {
        await applySize(first.width, first.height)
        if (!(await pause(PILL_RESIZE_MS))) return
      }
      await applySize(windowWidth, windowHeight)

      // Signal that the window has finished resizing for context menu
      if (contextMenuOpen) {
        setContextMenuReady(true)
      }

      if (shouldShow) {
        await win.show().catch(() => {})
      } else {
        await win.hide().catch(() => {})
      }
      visible.current = shouldShow
    }

    // Serialize window updates; overlapping async resizes interleave setSize/setPosition.
    queue.current = queue.current.then(run).catch(() => {})
  }, [
    pipelineState,
    capsuleExpanded,
    hasError,
    contextMenuOpen,
    activeVoiceMode,
    errorHasAction,
    translateNameWidth,
    translateDots,
    doneFlash,
    copyOffer,
    shouldShow,
    setContextMenuReady,
  ])

  // While visible, follow the cursor to another screen. Moves go through the same queue as
  // resizes, and the new position comes from the anchor maths only (never read back).
  useEffect(() => {
    if (!shouldShow) return

    const follow = async () => {
      followQueued.current = false
      if (!visible.current || !anchor.current) return
      const {
        getCurrentWindow,
        LogicalPosition,
        availableMonitors,
        primaryMonitor,
        cursorPosition,
      } = await import('@tauri-apps/api/window')
      const cursor = await cursorPosition().catch(() => null)
      if (!cursor) return
      const monitors = await availableMonitors().catch(() => [])
      const primary = await primaryMonitor().catch(() => null)
      const target = pickFollowTarget(
        monitors,
        cursorLogicalPoint(cursor, primary?.scaleFactor),
        anchorMonitor.current,
      )
      if (!target || !visible.current) return

      const element = fadeTarget?.current ?? null
      const fade = element !== null && !prefersReducedMotion()
      if (fade) await fadeTo(element, 0)
      anchor.current = capsuleAnchorForMonitor(
        target,
        anchorSize.current.width,
        anchorSize.current.height,
      )
      anchorMonitor.current = monitorKey(target)
      const origin = capsuleOrigin(anchor.current, windowHeightNow.current)
      await getCurrentWindow()
        .setPosition(new LogicalPosition(origin.x, origin.y))
        .catch(() => {})
      if (fade) {
        await fadeTo(element, 1)
        element.style.transition = ''
        element.style.opacity = ''
      }
    }

    const timer = setInterval(() => {
      // One check at a time; skip a tick while the previous one is still waiting.
      if (followQueued.current) return
      followQueued.current = true
      queue.current = queue.current.then(follow).catch(() => {})
    }, FOLLOW_POLL_MS)
    return () => clearInterval(timer)
  }, [shouldShow, fadeTarget])

  return getSizeForState(
    pipelineState,
    capsuleExpanded,
    hasError,
    contextMenuOpen,
    activeVoiceMode,
    errorHasAction,
    { nameWidth: translateNameWidth, dots: translateDots },
    doneFlash,
    copyOffer,
  )
}
