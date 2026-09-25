import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Loader2, Mic, Square, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  ASK_CANCELLED_ERROR,
  abortAskDictation,
  answerAskAnyway,
  startAskDictation,
  stopAskDictation,
  takePendingAskMessage,
} from '../../lib/tauri'
import type { AskDictationResult, AskDictationStartResult } from '../../lib/tauri'
import { NeedsLiveInfo } from './NeedsLiveInfo'

interface AskPanelProps {
  embedded?: boolean
  showHeader?: boolean
  title?: string
}

type AskResultPayload = AskDictationResult

function currentNativeWindow() {
  try {
    return getCurrentWindow()
  } catch {
    return null
  }
}

function safeUnlisten(unlisten: () => void) {
  try {
    unlisten()
  } catch {
    // Tauri can reject stale listener cleanup during dev reloads.
  }
}

export function AskPanel({ embedded = false, showHeader = true, title = 'Ask' }: AskPanelProps) {
  const { t } = useTranslation()
  const [result, setResult] = useState<AskResultPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [answeringAnyway, setAnsweringAnyway] = useState(false)
  const [recordingContext, setRecordingContext] = useState<AskDictationStartResult | null>(null)
  const [dictationState, setDictationState] = useState<'idle' | 'recording' | 'processing'>('idle')
  const loadingRef = useRef(loading)
  const dictationStateRef = useRef(dictationState)
  const ownsDictationRef = useRef(false)
  const ignoreNextLocalResultRef = useRef(false)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadingRef.current = loading
    dictationStateRef.current = dictationState
  }, [dictationState, loading])

  const setBusy = useCallback((next: boolean) => {
    loadingRef.current = next
    setLoading(next)
  }, [])

  const setAskDictationState = useCallback((next: 'idle' | 'recording' | 'processing') => {
    dictationStateRef.current = next
    setDictationState(next)
  }, [])

  const applyResult = useCallback(
    (payload: AskResultPayload) => {
      ignoreNextLocalResultRef.current = false
      setResult(payload)
      setError('')
      setCopied(false)
      setRecordingContext(null)
      setAskDictationState('idle')
      setBusy(false)
    },
    [setAskDictationState, setBusy],
  )

  const applyError = useCallback(
    (message: string) => {
      ignoreNextLocalResultRef.current = false
      setError(message)
      setResult(null)
      setCopied(false)
      setRecordingContext(null)
      setAskDictationState('idle')
      setBusy(false)
    },
    [setAskDictationState, setBusy],
  )

  const applyRecordingStarted = useCallback(
    (payload: AskDictationStartResult) => {
      ignoreNextLocalResultRef.current = false
      setResult(null)
      setError('')
      setCopied(false)
      setRecordingContext(payload)
      ownsDictationRef.current = true
      setAskDictationState('recording')
      setBusy(false)
    },
    [setAskDictationState, setBusy],
  )

  const beginDictation = useCallback(async () => {
    if (loadingRef.current || dictationStateRef.current !== 'idle') return

    ignoreNextLocalResultRef.current = false
    setResult(null)
    setError('')
    setCopied(false)
    setRecordingContext(null)
    setAskDictationState('recording')
    ownsDictationRef.current = true
    try {
      applyRecordingStarted(await startAskDictation())
    } catch (e) {
      ownsDictationRef.current = false
      setError(e instanceof Error ? e.message : String(e))
      setRecordingContext(null)
      setAskDictationState('idle')
    }
  }, [applyRecordingStarted, setAskDictationState])

  const finishDictation = useCallback(async () => {
    if (loadingRef.current || dictationStateRef.current !== 'recording') return

    setAskDictationState('processing')
    setBusy(true)
    setError('')
    setRecordingContext(null)
    ownsDictationRef.current = false
    try {
      const result = await stopAskDictation()
      if (ignoreNextLocalResultRef.current) {
        ignoreNextLocalResultRef.current = false
      } else {
        applyResult(result)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (ignoreNextLocalResultRef.current || message === ASK_CANCELLED_ERROR) {
        // Dismissed, or cancelled with Escape: show nothing.
        ignoreNextLocalResultRef.current = false
      } else {
        applyError(message)
      }
    } finally {
      ownsDictationRef.current = false
      setBusy(false)
      setAskDictationState('idle')
    }
  }, [applyError, applyResult, setAskDictationState, setBusy])

  const hideStandaloneWindow = useCallback(async () => {
    if (embedded) return
    const window = currentNativeWindow()
    if (!window) return
    try {
      await window.hide()
    } catch {
      // Tests and browser preview do not always provide a native Tauri window.
    }
  }, [embedded])

  const dismissStandalone = useCallback(
    (ignorePendingResult = true) => {
      if (embedded) return
      if (
        ignorePendingResult &&
        (loadingRef.current || dictationStateRef.current === 'processing')
      ) {
        ignoreNextLocalResultRef.current = true
      }
      if (ownsDictationRef.current && dictationStateRef.current === 'recording') {
        ownsDictationRef.current = false
        void abortAskDictation().catch(() => {})
      }
      setResult(null)
      setError('')
      setCopied(false)
      setRecordingContext(null)
      setBusy(false)
      setAskDictationState('idle')
      void hideStandaloneWindow()
    },
    [embedded, hideStandaloneWindow, setAskDictationState, setBusy],
  )

  useEffect(() => {
    if (embedded) return

    let cancelled = false
    const unlisteners: Array<() => void> = []
    const applyPendingMessage = async () => {
      const pending = await takePendingAskMessage()
      if (cancelled || !pending) return
      if (pending.kind === 'result') {
        applyResult(pending.payload)
      } else if (pending.kind === 'error') {
        applyError(pending.payload)
      }
    }

    import('@tauri-apps/api/event')
      .then(({ listen }) =>
        Promise.all([
          listen<AskResultPayload>('ask:result', (event) => {
            if (!cancelled) {
              applyResult(event.payload)
              void takePendingAskMessage().catch(() => {})
            }
          }),
          listen<string>('ask:error', (event) => {
            if (!cancelled) {
              applyError(event.payload)
              void takePendingAskMessage().catch(() => {})
            }
          }),
        ]),
      )
      .then((listeners) => {
        if (cancelled) {
          listeners.forEach(safeUnlisten)
        } else {
          unlisteners.push(...listeners)
          void applyPendingMessage().catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      unlisteners.forEach(safeUnlisten)
    }
  }, [applyError, applyResult, embedded])

  useEffect(() => {
    if (embedded) return

    let cancelled = false
    let unlistenFocus: (() => void) | null = null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      dismissStandalone(true)
    }

    window.addEventListener('keydown', onKeyDown)
    const nativeWindow = currentNativeWindow()
    nativeWindow
      ?.onFocusChanged((event) => {
        if (cancelled || event.payload) return
        dismissStandalone(true)
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten()
        } else {
          unlistenFocus = unlisten
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKeyDown)
      if (unlistenFocus) safeUnlisten(unlistenFocus)
    }
  }, [dismissStandalone, embedded])

  useEffect(() => {
    return () => {
      if (!ownsDictationRef.current) return
      if (dictationStateRef.current !== 'recording') return
      ownsDictationRef.current = false
      Promise.resolve(abortAskDictation()).catch(() => {})
    }
  }, [])

  const toggleDictation = useCallback(() => {
    if (dictationState === 'recording') {
      void finishDictation()
      return
    }

    void beginDictation()
  }, [beginDictation, dictationState, finishDictation])

  const answer = result?.answer ?? ''
  const needsLiveInfo = !error && result?.output === 'needsLiveInfo'

  // Plan 0011: "Answer anyway" on a live question answers from the model's own knowledge.
  const answerAnyway = useCallback(() => {
    if (!result || answeringAnyway) return
    setAnsweringAnyway(true)
    answerAskAnyway(result.question)
      .then(applyResult)
      .catch((e: unknown) => applyError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAnsweringAnyway(false))
  }, [answeringAnyway, applyError, applyResult, result])

  const closeLiveInfo = useCallback(() => {
    if (embedded) {
      setResult(null)
      return
    }
    dismissStandalone(true)
  }, [dismissStandalone, embedded])

  const liveInfoPanel = needsLiveInfo ? (
    <NeedsLiveInfo
      onAnswerAnyway={answerAnyway}
      onClose={closeLiveInfo}
      answering={answeringAnyway}
    />
  ) : null
  const outOfDateNote =
    result?.mayBeOutOfDate && !error ? (
      <p className="mt-2 text-[11px] leading-4 text-text-tertiary">{t('ask.outOfDateNote')}</p>
    ) : null

  const copyAnswer = useCallback(() => {
    if (!answer) return
    navigator.clipboard
      .writeText(answer)
      .then(() => {
        setCopied(true)
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
        copiedTimerRef.current = setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }, [answer])

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const capsuleLabel =
    dictationState === 'recording'
      ? t('ask.listening')
      : dictationState === 'processing'
        ? t('ask.thinking')
        : t('ask.ready')
  const capsuleActive = dictationState === 'recording' || dictationState === 'processing'
  const displayTitle = title === 'Ask' ? t('ask.title') : title
  const resultText = error || answer
  const hasContent = Boolean(resultText) || needsLiveInfo
  const canCopyAnswer = Boolean(answer && !error && result?.output !== 'openedSearch')
  const recordingContextLabel = recordingContext?.usedSelectedText
    ? recordingContext.selectedTextTruncated
      ? t('ask.usingSelectedTextTruncated')
      : t('ask.usingSelectedText')
    : null
  const contextLabel =
    result?.fallbackReason === 'feature_disabled'
      ? t('ask.routeDisabled')
      : result?.output === 'copiedFallback'
        ? result.fallbackReason === 'target_changed' ||
          result.fallbackReason === 'focus_restore_failed'
          ? t('ask.targetChanged')
          : t('ask.copiedInstead')
        : result?.usedSelectedText
          ? result.selectedTextTruncated
            ? t('ask.usingSelectedTextTruncated')
            : t('ask.usingSelectedText')
          : result?.output === 'openedSearch' && result.searchProvider
            ? t('ask.searchOpened', { provider: result.searchProvider })
            : t('ask.questionLabel')
  const copyAction = canCopyAnswer ? (
    <div className="flex shrink-0 items-center gap-2">
      {copied && <span className="text-[11px] text-success">{t('ask.copied')}</span>}
      <button
        type="button"
        aria-label={t('ask.copyAnswer')}
        title={t('ask.copyAnswer')}
        onClick={copyAnswer}
        className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-border bg-bg-secondary text-text-tertiary transition-colors hover:border-border-focus hover:text-accent cursor-pointer"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  ) : null

  const voiceButton = (
    <button
      type="button"
      aria-label={dictationState === 'recording' ? t('ask.stopAndAsk') : t('ask.recordQuestion')}
      onClick={toggleDictation}
      disabled={loading && dictationState !== 'recording'}
      className={`h-11 rounded-full border px-4 text-[13px] font-medium cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2 transition-colors ${
        capsuleActive
          ? 'bg-accent text-on-accent border-accent shadow-sm'
          : 'bg-bg-secondary text-text-primary border-border hover:border-border-focus'
      }`}
    >
      {dictationState === 'processing' ? (
        <Loader2 size={14} className="animate-spin" />
      ) : dictationState === 'recording' ? (
        <span className="h-2 w-2 rounded-full bg-on-accent animate-pulse" />
      ) : (
        <Mic size={14} />
      )}
      <span className="flex-1 text-left">
        <span className="block text-[13px]">{t('ask.voiceQuestion')}</span>
        <span
          className={`block text-[11px] font-normal ${
            capsuleActive ? 'text-on-accent/70' : 'text-text-tertiary'
          }`}
        >
          {capsuleLabel}
        </span>
      </span>
      {dictationState === 'recording' && <Square size={13} />}
    </button>
  )
  const standaloneCloseButton = (
    <button
      type="button"
      aria-label={t('onboarding.layout.close')}
      title={t('onboarding.layout.close')}
      onClick={() => dismissStandalone(true)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-bg-primary/80 text-text-tertiary transition-colors hover:border-border-focus hover:text-text-primary"
    >
      <X size={14} />
    </button>
  )

  const startStandaloneDrag = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    const window = currentNativeWindow()
    void window?.startDragging().catch(() => {})
  }, [])

  if (!embedded) {
    return (
      <div
        data-testid="ask-floating-note-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) dismissStandalone(true)
        }}
        className="min-h-screen w-screen bg-transparent p-3 text-text-primary"
      >
        <section
          data-testid="ask-floating-note"
          onMouseDown={startStandaloneDrag}
          className="flex max-h-[calc(100vh-24px)] w-full flex-col overflow-hidden rounded-[18px] border border-border/80 bg-bg-primary/95 shadow-[0_4px_14px_rgba(15,23,42,0.08)] backdrop-blur"
        >
          <div className="flex min-h-0 flex-col gap-2.5 p-3">
            {!hasContent && (
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-text-tertiary/50" />
                  <span className="truncate text-[12px] font-medium text-text-primary">
                    {displayTitle}
                  </span>
                </div>
                {standaloneCloseButton}
              </div>
            )}
            {hasContent && (
              <>
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        error ? 'bg-error' : 'bg-text-tertiary/50'
                      }`}
                    />
                    <span className="truncate text-[12px] font-medium text-text-primary">
                      {displayTitle}
                    </span>
                    {result && !needsLiveInfo && (
                      <span className="truncate text-[11px] text-text-tertiary">
                        {contextLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {copyAction}
                    {standaloneCloseButton}
                  </div>
                </div>
                <div className="min-h-0 overflow-y-auto rounded-[12px] border border-border bg-bg-secondary/65 px-3 py-2">
                  {result && !error && result.output !== 'openedSearch' && (
                    <p className="mb-2 text-[12px] leading-5 text-text-secondary">
                      {result.question}
                    </p>
                  )}
                  {liveInfoPanel ?? (
                    <p
                      className={`whitespace-pre-wrap text-[13px] leading-5 ${
                        error ? 'text-error' : 'text-text-primary'
                      }`}
                    >
                      {resultText}
                    </p>
                  )}
                  {outOfDateNote}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div
      className={`${embedded ? 'w-full' : 'h-screen w-screen'} bg-bg-primary text-text-primary flex flex-col`}
    >
      {showHeader && (
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[13px] font-medium">{displayTitle}</span>
        </div>
      )}

      <div className={`${embedded ? 'p-3' : 'flex-1 min-h-0 p-3'} flex flex-col gap-3`}>
        {voiceButton}

        <p className="text-[11px] text-text-tertiary -mt-1">
          {recordingContextLabel ?? t('ask.voiceQuestionDesc')}
        </p>

        {hasContent && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-[8px] border border-border bg-bg-secondary px-3 py-2">
            {canCopyAnswer && (
              <div className="mb-2 flex items-center justify-between gap-2">
                {result && (
                  <span className="truncate text-[11px] text-text-tertiary">{contextLabel}</span>
                )}
                {copyAction}
              </div>
            )}
            {result && !error && result.output !== 'openedSearch' && (
              <p className="mb-2 text-[12px] leading-5 text-text-secondary">{result.question}</p>
            )}
            {liveInfoPanel ?? (
              <p
                className={`text-[13px] leading-5 whitespace-pre-wrap ${
                  error ? 'text-error' : 'text-text-primary'
                }`}
              >
                {resultText}
              </p>
            )}
            {outOfDateNote}
          </div>
        )}
      </div>
    </div>
  )
}
