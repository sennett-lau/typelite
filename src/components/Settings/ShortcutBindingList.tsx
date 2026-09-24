import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { MoreHorizontal, Plus, X } from 'lucide-react'
import {
  bindingFromHotkey,
  capturedKeysNeedModifier,
  displayBinding,
  displayHotkey,
  hotkeyBindingIdentity,
  hotkeyFromCapturedKeys,
  isMacPlatform,
} from '../../stores/appStore'
import type { HotkeyRole, ShortcutCaptureEvent } from '../../lib/tauri'
import type { ShortcutBinding } from '../../stores/appStore'
import {
  pauseHotkey,
  resumeHotkey,
  SHORTCUT_CAPTURE_EVENT,
  startShortcutCapture,
  stopShortcutCapture,
} from '../../lib/tauri'

const STANDALONE_KEYS = new Set([
  'Space',
  'Tab',
  'Enter',
  'Backspace',
  'Escape',
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Up',
  'Down',
  'Left',
  'Right',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
])

const MAX_BINDINGS = 3

interface HotkeyRecorderProps {
  /** What the field shows when it is not recording. */
  value: string
  onSaved: (hotkey: string) => void
  validateHotkey?: (hotkey: string) => string | null
  disabled?: boolean
  autoStart?: boolean
  onCancel?: () => void
}

/**
 * A shortcut field. On macOS it records through the native key listener, which sees Fn,
 * End, F13+ and left/right modifiers; elsewhere it falls back to web `keydown` events.
 */
export function HotkeyRecorder(props: HotkeyRecorderProps) {
  return isMacPlatform() ? <NativeHotkeyRecorder {...props} /> : <WebHotkeyRecorder {...props} />
}

interface CaptureSession {
  active: boolean
  unlisten: UnlistenFn | null
}

/**
 * Click → "Press keys…" → hold the combination (shown live) → release all keys to save.
 * Esc, a second click or leaving the window cancels. The Rust side pauses the configured
 * shortcuts while recording; `stopShortcutCapture` always registers them again.
 */
function NativeHotkeyRecorder({
  value,
  onSaved,
  validateHotkey,
  disabled = false,
  autoStart = false,
  onCancel,
}: HotkeyRecorderProps) {
  const { t } = useTranslation()
  const [recording, setRecording] = useState(false)
  const [live, setLive] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const sessionRef = useRef<CaptureSession | null>(null)
  const autoStarted = useRef(false)
  const latest = useRef({ onSaved, validateHotkey, onCancel, t })

  useEffect(() => {
    latest.current = { onSaved, validateHotkey, onCancel, t }
  })

  const endSession = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    sessionRef.current = null
    session.active = false
    session.unlisten?.()
    setRecording(false)
    setLive([])
    stopShortcutCapture().catch((stopError) => setError(String(stopError)))
  }, [])

  const cancel = useCallback(() => {
    if (!sessionRef.current) return
    endSession()
    setError(null)
    latest.current.onCancel?.()
  }, [endSession])

  const finish = useCallback(
    (keys: string[]) => {
      endSession()
      const { t: translate, validateHotkey: validate, onSaved: save } = latest.current
      if (capturedKeysNeedModifier(keys)) {
        setError(translate('shortcutCapture.needsModifier'))
        return
      }
      const hotkey = hotkeyFromCapturedKeys(keys)
      if (!hotkey) {
        setError(translate('shortcutCapture.invalid'))
        return
      }
      const validationError = validate?.(hotkey)
      if (validationError) {
        setError(validationError)
        return
      }
      setError(null)
      save(hotkey)
    },
    [endSession],
  )

  const start = useCallback(async () => {
    if (disabled || sessionRef.current) return
    const session: CaptureSession = { active: true, unlisten: null }
    sessionRef.current = session
    setRecording(true)
    setLive([])
    setError(null)
    try {
      const unlisten = await listen<ShortcutCaptureEvent>(SHORTCUT_CAPTURE_EVENT, (event) => {
        if (!session.active) return
        const payload = event.payload
        if (payload.cancelled) cancel()
        else if (payload.finished) finish(payload.held)
        else setLive(payload.held)
      })
      if (!session.active) {
        unlisten()
        return
      }
      session.unlisten = unlisten
      await startShortcutCapture()
    } catch (startError) {
      if (!session.active) return
      endSession()
      setError(latest.current.t('shortcutCapture.failed', { error: String(startError) }))
    }
  }, [cancel, disabled, endSession, finish])

  useEffect(() => {
    if (!recording) return
    window.addEventListener('blur', cancel)
    return () => window.removeEventListener('blur', cancel)
  }, [cancel, recording])

  useEffect(() => endSession, [endSession])

  useEffect(() => {
    if (!autoStart || autoStarted.current) return
    autoStarted.current = true
    void start()
  }, [autoStart, start])

  const handleClick = () => {
    if (disabled) return
    if (recording) cancel()
    else void start()
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={`h-7 min-w-0 flex-1 rounded-[6px] border px-2.5 text-left font-mono text-[12px] transition-colors disabled:opacity-40 ${
            recording
              ? 'border-border-focus bg-bg-tertiary text-text-primary ring-2 ring-accent/20'
              : 'border-transparent bg-bg-secondary text-text-primary hover:border-border'
          }`}
        >
          {recording
            ? live.length > 0
              ? displayHotkey(live)
              : t('shortcutCapture.pressKeys')
            : value}
        </button>
        {recording && onCancel && (
          <button
            type="button"
            onClick={cancel}
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
            className="btn-icon"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {recording && (
        <p className="mt-1 text-[11px] text-text-tertiary">{t('shortcutCapture.hint')}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-error">{error}</p>}
    </div>
  )
}

/** Fallback for Windows/Linux: records from web `keydown` events (no Fn, no left/right). */
function WebHotkeyRecorder({
  value,
  onSaved,
  validateHotkey,
  disabled = false,
  autoStart = false,
  onCancel,
}: HotkeyRecorderProps) {
  const { t } = useTranslation()
  const isMac = isMacPlatform()
  const [recording, setRecording] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [modifierHint, setModifierHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoConfirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStarted = useRef(false)
  const recordingRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (!autoConfirmTimer.current) return
    clearTimeout(autoConfirmTimer.current)
    autoConfirmTimer.current = null
  }, [])

  const confirmHotkey = useCallback(
    (hotkey: string) => {
      clearTimer()
      recordingRef.current = false
      setRecording(false)
      setModifierHint(null)
      setPending(null)
      const validationError = validateHotkey?.(hotkey)
      if (validationError) {
        setError(validationError)
        resumeHotkey().catch((resumeError) => setError(String(resumeError)))
        return
      }
      setError(null)
      onSaved(hotkey)
      resumeHotkey().catch((resumeError) => setError(String(resumeError)))
    },
    [clearTimer, onSaved, validateHotkey],
  )

  const cancelRecording = useCallback(() => {
    clearTimer()
    recordingRef.current = false
    setRecording(false)
    setPending(null)
    setModifierHint(null)
    setError(null)
    resumeHotkey().catch(() => {})
    onCancel?.()
  }, [clearTimer, onCancel])

  const startRecording = useCallback(() => {
    if (disabled) return
    pauseHotkey().catch(() => {})
    recordingRef.current = true
    setRecording(true)
    setPending(null)
    setModifierHint(null)
    setError(null)
  }, [disabled])

  useEffect(() => {
    return () => {
      if (!recordingRef.current) return
      recordingRef.current = false
      resumeHotkey().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!autoStart || autoStarted.current) return
    autoStarted.current = true
    startRecording()
  }, [autoStart, startRecording])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const parts: string[] = []
      if (isMac && event.metaKey) parts.push('Command')
      if (event.ctrlKey) parts.push('Ctrl')
      if (event.altKey) parts.push(isMac ? 'Option' : 'Alt')
      if (event.shiftKey) parts.push('Shift')
      if (!isMac && event.metaKey) parts.push('Meta')

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        setModifierHint(parts.length > 0 ? `${parts.join('+')}+...` : null)
        return
      }

      setModifierHint(null)
      const keyMap: Record<string, string> = {
        ' ': 'Space',
        Tab: 'Tab',
        Enter: 'Enter',
        Backspace: 'Backspace',
        Escape: 'Escape',
        Delete: 'Delete',
        Insert: 'Insert',
        Home: 'Home',
        End: 'End',
        PageUp: 'PageUp',
        PageDown: 'PageDown',
        ArrowUp: 'Up',
        ArrowDown: 'Down',
        ArrowLeft: 'Left',
        ArrowRight: 'Right',
        '。': '.',
        '?': '/',
      }
      let keyName = keyMap[event.key] || event.key
      if (keyName.length === 1) keyName = keyName.toUpperCase()
      if (parts.length === 0 && !STANDALONE_KEYS.has(keyName)) return

      parts.push(keyName)
      const combo = parts.join('+')
      setPending(combo)
      if (autoConfirmTimer.current) clearTimeout(autoConfirmTimer.current)
      autoConfirmTimer.current = setTimeout(() => confirmHotkey(combo), 1500)
    },
    [confirmHotkey, isMac],
  )

  useEffect(() => {
    if (!recording) return
    const clearModifierHint = () => setModifierHint(null)
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', clearModifierHint, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', clearModifierHint, true)
      clearTimer()
    }
  }, [clearTimer, handleKeyDown, recording])

  const handleClick = () => {
    if (disabled) return
    if (recording && pending) {
      confirmHotkey(pending)
    } else if (recording) {
      cancelRecording()
    } else {
      startRecording()
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className={`h-7 min-w-0 flex-1 rounded-[6px] border px-2.5 text-left font-mono text-[12px] transition-colors disabled:opacity-40 ${
            recording
              ? 'border-border-focus bg-bg-tertiary text-text-primary ring-2 ring-accent/20'
              : 'border-transparent bg-bg-secondary text-text-primary hover:border-border'
          }`}
        >
          {recording ? pending || modifierHint || t('settings.pressKeyCombination') : value}
        </button>
        {recording && onCancel && (
          <button
            type="button"
            onClick={cancelRecording}
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
            className="btn-icon"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {recording && pending && (
        <p className="mt-1 text-[11px] text-text-tertiary">{t('settings.clickToConfirm')}</p>
      )}
      {error && <p className="mt-1 text-[11px] text-error">{error}</p>}
    </div>
  )
}

interface ShortcutBindingListProps {
  role: Extract<HotkeyRole, 'dictation' | 'ask' | 'translate'>
  label: string
  bindings: ShortcutBinding[]
  otherBindings: ShortcutBinding[]
  required: boolean
  onChange: (bindings: ShortcutBinding[]) => void
  disabled?: boolean
  trailingAction?: React.ReactNode
}

const bindingIdentity = hotkeyBindingIdentity

export function ShortcutBindingList({
  role,
  label,
  bindings,
  otherBindings,
  required,
  onChange,
  disabled = false,
  trailingAction,
}: ShortcutBindingListProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const menuButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const atLimit = bindings.length >= MAX_BINDINGS

  useEffect(() => {
    if (atLimit) setAdding(false)
  }, [atLimit])

  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuIndex((current) => {
      if (restoreFocus && current !== null) {
        requestAnimationFrame(() => menuButtonRefs.current[current]?.focus())
      }
      return null
    })
  }, [])

  useEffect(() => {
    if (menuIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeMenu, menuIndex])

  const validate = (hotkey: string, editingIndex: number | null) => {
    const candidate = bindingFromHotkey(hotkey)
    if (!candidate) return t('shortcutCapture.invalid')
    const identity = bindingIdentity(candidate)
    const ownConflicts = bindings.some(
      (binding, index) => index !== editingIndex && bindingIdentity(binding) === identity,
    )
    const externalConflict = otherBindings.some((binding) => bindingIdentity(binding) === identity)
    return ownConflicts || externalConflict ? t('shortcutCapture.conflict') : null
  }

  const saveAt = (index: number, hotkey: string) => {
    const binding = bindingFromHotkey(hotkey)
    if (!binding) return
    onChange(bindings.map((current, currentIndex) => (currentIndex === index ? binding : current)))
  }

  const makePrimary = (index: number) => {
    if (index <= 0 || index >= bindings.length) return
    onChange([bindings[index], ...bindings.filter((_, currentIndex) => currentIndex !== index)])
  }

  return (
    <div data-hotkey-role={role} className="row items-start">
      <div className="row-label pt-1">
        <span>{label}</span>
        {atLimit && <span className="row-help">{t('settings.shortcutMax')}</span>}
      </div>

      <div className="flex w-[280px] max-w-full min-w-0 items-start gap-1">
        <div className="min-w-0 flex-1 space-y-1.5">
          {bindings.map((binding, index) => (
            <div
              key={`${bindingIdentity(binding)}-${index}`}
              className="flex min-w-0 items-start gap-1"
            >
              <div className="min-w-0 flex-1">
                <HotkeyRecorder
                  value={displayBinding(binding)}
                  disabled={disabled}
                  validateHotkey={(hotkey) => validate(hotkey, index)}
                  onSaved={(hotkey) => saveAt(index, hotkey)}
                />
                {bindings.length > 1 && index === 0 && (
                  <p className="mt-0.5 text-[10px] text-text-tertiary">
                    {t('settings.shortcutPrimary')}
                  </p>
                )}
              </div>
              {(bindings.length > 1 || !required) && (
                <div className="relative flex-none">
                  <button
                    ref={(element) => {
                      menuButtonRefs.current[index] = element
                    }}
                    type="button"
                    aria-label={t('settings.shortcutManage')}
                    title={t('settings.shortcutManage')}
                    aria-expanded={menuIndex === index}
                    onClick={() => setMenuIndex((current) => (current === index ? null : index))}
                    disabled={disabled}
                    className="btn-icon"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                  {menuIndex === index && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => closeMenu(true)} />
                      <div className="menu absolute right-0 top-8 z-40 min-w-[150px] py-1">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              closeMenu()
                              makePrimary(index)
                            }}
                            className="menu-item"
                          >
                            {t('settings.shortcutMakePrimary')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            closeMenu()
                            onChange(bindings.filter((_, currentIndex) => currentIndex !== index))
                          }}
                          className="menu-item hover:text-error"
                        >
                          {t('settings.shortcutRemove')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {adding && !atLimit && (
            <HotkeyRecorder
              value=""
              disabled={disabled}
              autoStart
              onCancel={() => setAdding(false)}
              validateHotkey={(hotkey) => validate(hotkey, null)}
              onSaved={(hotkey) => {
                const binding = bindingFromHotkey(hotkey)
                if (!binding) return
                setAdding(false)
                onChange([...bindings, binding])
              }}
            />
          )}
        </div>

        {trailingAction}
        <button
          type="button"
          aria-label={t('settings.shortcutAdd')}
          title={t('settings.shortcutAdd')}
          disabled={disabled || atLimit || adding}
          onClick={() => setAdding(true)}
          className="btn-icon"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  )
}
