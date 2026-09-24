import { useEffect, useRef } from 'react'
import { useAppStore, type PipelineState, type VoiceMode } from '../stores/appStore'

export interface CapsuleSize {
  width: number
  height: number
}

/** Translate recording: dot, waveform, three language chips, timer and cancel button. */
export const TRANSLATE_RECORDING_SIZE: CapsuleSize = { width: 296, height: 36 }
/** Ask recording: icon, title, waveform, timer and cancel button. */
export const ASK_RECORDING_SIZE: CapsuleSize = { width: 248, height: 36 }
/**
 * Dictation recording (dot, waveform, timer, cancel button needs about 212 pt), and the
 * transcribing, polishing and error states that share its width.
 */
export const DICTATION_PILL_SIZE: CapsuleSize = { width: 216, height: 36 }

export interface CapsuleVisibilityInput {
  contextMenuOpen: boolean
  capsuleExpanded: boolean
  hasError: boolean
  pipelineState: PipelineState
}

/** The idle capsule is always hidden; it shows only while working, or for an error or menu. */
export function getCapsuleVisibility({
  contextMenuOpen,
  capsuleExpanded,
  hasError,
  pipelineState,
}: CapsuleVisibilityInput): boolean {
  return contextMenuOpen || capsuleExpanded || hasError || pipelineState !== 'idle'
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
): CapsuleSize {
  if (contextMenuOpen) return { width: 220, height: 220 }
  if (hasError) return DICTATION_PILL_SIZE
  if (expanded) return { width: 220, height: 90 }
  switch (state) {
    case 'idle':
      return { width: 36, height: 36 }
    case 'preparing':
      return { width: 180, height: 36 }
    case 'recording':
      return activeVoiceMode === 'translate' ? TRANSLATE_RECORDING_SIZE : DICTATION_PILL_SIZE
    case 'transcribing':
    case 'polishing':
      return DICTATION_PILL_SIZE
    case 'outputting':
      return { width: 144, height: 36 }
    case 'ask_recording':
      return ASK_RECORDING_SIZE
    case 'ask_thinking':
      return { width: 168, height: 36 }
    default:
      return { width: 36, height: 36 }
  }
}

export function useCapsuleResize() {
  const pipelineState = useAppStore((s) => s.pipelineState)
  const capsuleExpanded = useAppStore((s) => s.capsuleExpanded)
  const pipelineError = useAppStore((s) => s.pipelineError)
  const contextMenuOpen = useAppStore((s) => s.contextMenuOpen)
  const activeVoiceMode = useAppStore((s) => s.activeVoiceMode)
  const setContextMenuReady = useAppStore((s) => s.setContextMenuReady)
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
    )
    const windowWidth = size.width + 24
    const windowHeight = size.height + 24
    const shouldShow = getCapsuleVisibility({
      contextMenuOpen,
      capsuleExpanded,
      hasError,
      pipelineState,
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
    setContextMenuReady,
  ])

  return getSizeForState(pipelineState, capsuleExpanded, hasError, contextMenuOpen, activeVoiceMode)
}
