import { useRef, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useAppStore, type PipelineState } from '../../stores/appStore'
import { useRecording } from '../../hooks/useRecording'
import {
  getCapsuleState,
  getCapsuleVisibility,
  getPillSize,
  useCapsuleResize,
  type CapsuleSize,
} from '../../hooks/useCapsuleResize'
import { stopAskFlow } from '../../lib/tauri'
import { CapsulePreparing } from './CapsulePreparing'
import { CapsuleRecording } from './CapsuleRecording'
import { CapsuleProcessing } from './CapsuleProcessing'
import { CapsulePolishing } from './CapsulePolishing'
import { CapsuleDone, CapsulePasting } from './CapsuleComplete'
import { CapsuleError } from './CapsuleError'
import { CapsuleContextMenu } from './CapsuleContextMenu'
import { CapsuleAskRecording } from './CapsuleAskRecording'
import { CapsuleAskThinking } from './CapsuleAskThinking'
import { CapsuleAurora, type AuroraMode } from './CapsuleAurora'

const DRAG_THRESHOLD = 5
/** How long the done flash stays before the pill hides. */
const DONE_FLASH_MS = 500
/** Plan 0018 content cross-fade: the old content fades out while the new one fades in. */
const EASE = [0.2, 0, 0, 1] as const
const CONTENT_ENTER = { duration: 0.22, delay: 0.06, ease: EASE }
const CONTENT_EXIT = { duration: 0.14, ease: 'easeIn' as const }
/** The aurora light fades in quickly and out slowly instead of cutting. */
const AURORA_FADE_IN = { duration: 0.15, ease: 'easeOut' as const }
const AURORA_FADE_OUT = { duration: 0.3, ease: 'easeOut' as const }

/** What the pill last showed while visible; kept while it slides away (plan 0018). */
interface ShownPill {
  state: string
  size: CapsuleSize
  error: string | null
  errorHasAction: boolean
}

function auroraModeFor(capsuleState: string): AuroraMode | null {
  switch (capsuleState) {
    case 'recording':
    case 'ask_recording':
      return 'listening'
    case 'transcribing':
    case 'polishing':
    case 'outputting':
    case 'ask_thinking':
      return 'working'
    case 'done':
      return 'done'
    default:
      return null
  }
}

/** States after which reaching idle means the run produced its result. */
const RESULT_STATES = new Set<string>(['transcribing', 'polishing', 'outputting'])

/**
 * True for a moment after a run finished (transcribing, polishing or pasting -> idle without an
 * error), so the pill can show its done flash before it hides. Streaming output can go straight
 * from polishing to idle, so any of those states counts. The first idle render already returns
 * true (from the previous state), so the idle icon never flashes before the done state.
 */
function useDoneFlash(pipelineState: PipelineState, hasError: boolean): boolean {
  const [flash, setFlash] = useState(false)
  const previous = useRef(pipelineState)
  // Only runs that inserted text flash "done"; a cancelled run just hides.
  const lastInsertResult = useAppStore((s) => s.lastInsertResult)
  const inserted = useRef(false)
  const seenInsert = useRef(lastInsertResult)
  if (lastInsertResult !== seenInsert.current) {
    seenInsert.current = lastInsertResult
    inserted.current = lastInsertResult !== null
  }
  if (pipelineState === 'preparing' || pipelineState === 'recording') inserted.current = false
  const finishingNow =
    pipelineState === 'idle' && !hasError && inserted.current && RESULT_STATES.has(previous.current)

  useEffect(() => {
    const finishedPaste =
      RESULT_STATES.has(previous.current) && pipelineState === 'idle' && inserted.current
    previous.current = pipelineState
    if (pipelineState !== 'idle' || hasError) {
      setFlash(false)
      return
    }
    if (!finishedPaste) return
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), DONE_FLASH_MS)
    return () => clearTimeout(timer)
  }, [pipelineState, hasError])

  return flash || finishingNow
}

export function Capsule() {
  const pipelineState = useAppStore((s) => s.pipelineState)
  const pipelineError = useAppStore((s) => s.pipelineError)
  const contextMenuOpen = useAppStore((s) => s.contextMenuOpen)
  const setContextMenuOpen = useAppStore((s) => s.setContextMenuOpen)
  const contextMenuReady = useAppStore((s) => s.contextMenuReady)
  const setContextMenuReady = useAppStore((s) => s.setContextMenuReady)
  const activeVoiceMode = useAppStore((s) => s.activeVoiceMode)
  const errorHasAction = useAppStore((s) => s.pipelineErrorAction !== null)
  const translateTargetCount = useAppStore((s) => s.config.translation.targets.length)
  const capsuleExpanded = useAppStore((s) => s.capsuleExpanded)
  const { stopRecording, isRecording } = useRecording()
  const reducedMotion = useReducedMotion()

  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)

  const rootRef = useRef<HTMLDivElement>(null)

  const hasError = pipelineError !== null
  const doneFlash = useDoneFlash(pipelineState, hasError)
  useCapsuleResize(doneFlash, rootRef)

  const liveState = getCapsuleState(pipelineState, hasError, doneFlash)
  const liveSize = getPillSize(liveState, activeVoiceMode, errorHasAction, translateTargetCount)
  const visible = getCapsuleVisibility({
    contextMenuOpen,
    capsuleExpanded,
    hasError,
    pipelineState,
    doneFlash,
  })

  // While visible the pill shows the live state. While it hides it keeps what it last showed,
  // so it slides away as it was instead of shrinking to the idle dot.
  const shown = useRef<ShownPill>({
    state: liveState,
    size: liveSize,
    error: pipelineError,
    errorHasAction,
  })
  if (visible) {
    shown.current = {
      state: liveState,
      size: liveSize,
      error: pipelineError,
      errorHasAction,
    }
  }
  const capsuleState = shown.current.state
  const capsuleShellSize = shown.current.size
  const auroraMode = visible ? auroraModeFor(capsuleState) : null

  // The render that shows the pill again takes the new size at once; later changes animate.
  const committedVisible = useRef(visible)
  const appearing = visible && !committedVisible.current
  useEffect(() => {
    committedVisible.current = visible
  }, [visible])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    dragStart.current = { x: e.clientX, y: e.clientY }
    isDragging.current = false
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current || isDragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      isDragging.current = true
      dragStart.current = null
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          getCurrentWindow()
            .startDragging()
            .catch(() => {})
        })
        .catch(() => {})
    }
  }, [])

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return
      if (isDragging.current) {
        isDragging.current = false
        dragStart.current = null
        return
      }
      dragStart.current = null

      if (pipelineState === 'ask_recording') {
        void stopAskFlow().catch((error) => {
          console.error('Failed to stop Ask flow:', error)
        })
      } else if (isRecording) {
        stopRecording()
      }
    },
    [isRecording, pipelineState, stopRecording],
  )

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!contextMenuOpen) {
      setContextMenuOpen(true)
    }
  }

  const handleCloseMenu = () => {
    setContextMenuReady(false)
    setContextMenuOpen(false)
  }

  return (
    <div
      ref={rootRef}
      className="w-full h-full flex items-center justify-start relative"
      style={{ background: 'transparent' }}
      onContextMenu={handleContextMenu}
    >
      {/* Persistent outer shell — the dark glass pill. Its width, height and corners animate
          with CSS (`.pill` in globals.css); hiding slides it down and fades it (`.pill-gone`). */}
      <div
        className={`pill absolute left-3 rounded-full pointer-events-auto shrink-0 ${
          capsuleState === 'error' ? 'pill-error' : ''
        } ${visible ? '' : 'pill-gone'} ${appearing ? 'pill-size-instant' : ''}`}
        style={{ ...capsuleShellSize, borderRadius: capsuleShellSize.height / 2 }}
        data-testid="capsule-shell"
        data-visible={visible}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <AnimatePresence initial={false}>
          {auroraMode && (
            <motion.div
              key={auroraMode}
              className="absolute inset-0"
              style={{ borderRadius: 'inherit' }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: auroraMode === 'done' ? { duration: 0 } : AURORA_FADE_IN,
              }}
              exit={{ opacity: 0, transition: AURORA_FADE_OUT }}
            >
              <CapsuleAurora mode={auroraMode} />
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={capsuleState}
            className="absolute inset-0"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(3px)', y: 2 }}
            animate={{
              opacity: 1,
              filter: 'blur(0px)',
              y: 0,
              transition: reducedMotion ? { duration: 0.15 } : CONTENT_ENTER,
            }}
            exit={{
              opacity: 0,
              ...(reducedMotion ? {} : { filter: 'blur(3px)' }),
              transition: CONTENT_EXIT,
            }}
          >
            {capsuleState === 'preparing' && <CapsulePreparing />}
            {capsuleState === 'recording' && <CapsuleRecording />}
            {capsuleState === 'transcribing' && <CapsuleProcessing />}
            {capsuleState === 'polishing' && <CapsulePolishing />}
            {capsuleState === 'outputting' && <CapsulePasting />}
            {capsuleState === 'done' && <CapsuleDone />}
            {capsuleState === 'ask_recording' && <CapsuleAskRecording />}
            {capsuleState === 'ask_thinking' && <CapsuleAskThinking />}
            {capsuleState === 'error' && (
              <CapsuleError
                message={shown.current.error}
                hasAction={shown.current.errorHasAction}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Context menu appears to the right of capsule */}
      {contextMenuOpen && contextMenuReady && (
        <div className="ml-2">
          <CapsuleContextMenu onClose={handleCloseMenu} />
        </div>
      )}
    </div>
  )
}
