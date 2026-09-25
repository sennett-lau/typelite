import { useEffect, useRef } from 'react'
import { useAppStore, type PipelineState, type VoiceMode } from '../stores/appStore'

export interface CapsuleSize {
  width: number
  height: number
}

// Pill sizes from plan 0009 (pill.md). The window adds 12 pt of padding on each side.

/** Dictate recording: red dot, 18-bar waveform and cancel button. */
export const DICTATION_RECORDING_SIZE: CapsuleSize = { width: 150, height: 36 }
/** Ask recording: Ask icon, waveform and cancel button. */
export const ASK_RECORDING_SIZE: CapsuleSize = { width: 150, height: 36 }
/** Translate recording with three language chips, or with one language name. */
export const TRANSLATE_RECORDING_SIZE: CapsuleSize = { width: 232, height: 36 }
/** Translate recording with two language chips. */
export const TRANSLATE_TWO_TARGETS_SIZE: CapsuleSize = { width: 208, height: 36 }
/**
 * Working states (preparing, transcribing, polishing, pasting, Ask thinking) and the done
 * flash: a short label over the aurora sweep.
 */
export const WORKING_PILL_SIZE: CapsuleSize = { width: 132, height: 36 }
/** An error message (icon and one line). */
export const ERROR_PILL_SIZE: CapsuleSize = { width: 216, height: 36 }
/** A setup message ("Set up speech recognition first") with its "Set up" button. */
export const SETUP_ERROR_SIZE: CapsuleSize = { width: 312, height: 36 }
const IDLE_SIZE: CapsuleSize = { width: 36, height: 36 }

/**
 * The pill's own size (without the context menu or window padding) for a capsule state.
 * `capsuleState` is the pipeline state, `error`, or `done` (the brief flash after pasting).
 */
export function getPillSize(
  capsuleState: string,
  activeVoiceMode: VoiceMode | null,
  errorHasAction: boolean,
  translateTargetCount: number,
): CapsuleSize {
  switch (capsuleState) {
    case 'error':
      return errorHasAction ? SETUP_ERROR_SIZE : ERROR_PILL_SIZE
    case 'recording':
      if (activeVoiceMode !== 'translate') return DICTATION_RECORDING_SIZE
      return translateTargetCount === 2 ? TRANSLATE_TWO_TARGETS_SIZE : TRANSLATE_RECORDING_SIZE
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
}

/** The idle capsule is always hidden; it shows only while working, or for an error or menu. */
export function getCapsuleVisibility({
  contextMenuOpen,
  capsuleExpanded,
  hasError,
  pipelineState,
  doneFlash = false,
}: CapsuleVisibilityInput): boolean {
  return contextMenuOpen || capsuleExpanded || hasError || doneFlash || pipelineState !== 'idle'
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
  translateTargetCount = 3,
  doneFlash = false,
): CapsuleSize {
  if (contextMenuOpen) return { width: 220, height: 220 }
  if (hasError) return getPillSize('error', activeVoiceMode, errorHasAction, translateTargetCount)
  if (expanded) return { width: 220, height: 90 }
  const capsuleState = doneFlash && state === 'idle' ? 'done' : state
  return getPillSize(capsuleState, activeVoiceMode, errorHasAction, translateTargetCount)
}

/** Sizes, places and shows the capsule window. `doneFlash` is true during the done flash. */
export function useCapsuleResize(doneFlash = false) {
  const pipelineState = useAppStore((s) => s.pipelineState)
  const capsuleExpanded = useAppStore((s) => s.capsuleExpanded)
  const pipelineError = useAppStore((s) => s.pipelineError)
  const errorHasAction = useAppStore((s) => s.pipelineErrorAction !== null)
  const contextMenuOpen = useAppStore((s) => s.contextMenuOpen)
  const activeVoiceMode = useAppStore((s) => s.activeVoiceMode)
  const setContextMenuReady = useAppStore((s) => s.setContextMenuReady)
  const translateTargetCount = useAppStore((s) => s.config.translation.targets.length)
  const anchor = useRef<CapsuleAnchor | null>(null)
  const visible = useRef(false)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const hasError = pipelineError !== null

  useEffect(() => {
    const size = getSizeForState(
      pipelineState,
      capsuleExpanded,
      hasError,
      contextMenuOpen,
      activeVoiceMode,
      errorHasAction,
      translateTargetCount,
      doneFlash,
    )
    const windowWidth = size.width + 24
    const windowHeight = size.height + 24
    const shouldShow = getCapsuleVisibility({
      contextMenuOpen,
      capsuleExpanded,
      hasError,
      pipelineState,
      doneFlash,
    })

    const run = async () => {
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
        // cursorPosition() is scaled by the primary monitor's factor.
        const primaryScale = primary?.scaleFactor || 1
        const target =
          (cursor &&
            pickMonitorForPoint(monitors, {
              x: cursor.x / primaryScale,
              y: cursor.y / primaryScale,
            })) ||
          primary ||
          monitors[0]
        if (target) {
          anchor.current = capsuleAnchorForMonitor(target, windowWidth, windowHeight)
        }
      }

      await win.setSize(new LogicalSize(windowWidth, windowHeight)).catch(() => {})
      if (anchor.current) {
        // Left edge and vertical centre stay fixed. Content is padded 12px each side,
        // so the mic icon never moves while the capsule grows or shrinks.
        const origin = capsuleOrigin(anchor.current, windowHeight)
        await win.setPosition(new LogicalPosition(origin.x, origin.y)).catch(() => {})
      }

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
    translateTargetCount,
    doneFlash,
    setContextMenuReady,
  ])

  return getSizeForState(
    pipelineState,
    capsuleExpanded,
    hasError,
    contextMenuOpen,
    activeVoiceMode,
    errorHasAction,
    translateTargetCount,
    doneFlash,
  )
}
