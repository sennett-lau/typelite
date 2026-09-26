import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyAskText, insertAskText } from '../../lib/tauri'
import type { AskDictationResult } from '../../lib/tauri'
import { KeyCap } from '../ui/KeyCap'

/** What the panel shows: an Ask result, or an error message. */
export type AskPanelContent =
  | { kind: 'result'; result: AskDictationResult }
  | { kind: 'error'; message: string }

interface AskAnswerPanelProps {
  content: AskPanelContent
  /** ✕ (Escape is handled natively and closes the panel from the app). */
  onClose: () => void
  /** "Answer anyway" for a question that needs live information. */
  onAnswerAnyway: () => void
  /** True while the "Answer anyway" request runs. */
  answering?: boolean
}

/** How long "Copied ✓" stays on the Copy button. */
const COPIED_MS = 1500

/**
 * Plan `ask-panel-above-pill`: the Ask panel above the pill (see `mock.html` in the plan). One
 * glass panel for every outcome: an answer (Copy, Insert), an edit that could not replace the
 * highlight (Try replacing again, Copied ✓), a question that needs live information (Answer
 * anyway), a site search, and errors. The window never takes focus, so Copy and Insert go
 * through the app, not the browser clipboard.
 */
export function AskAnswerPanel({
  content,
  onClose,
  onAnswerAnyway,
  answering = false,
}: AskAnswerPanelProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [inserting, setInserting] = useState(false)
  const [insertFailed, setInsertFailed] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const result = content.kind === 'result' ? content.result : null
  const output = result?.output ?? null
  const text = result?.answer ?? ''
  const couldNotReplace = output === 'copiedFallback'

  useEffect(() => {
    setCopied(false)
    setInsertFailed(false)
  }, [content])

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  const copy = useCallback(() => {
    if (!text) return
    copyAskText(text)
      .then(() => {
        setCopied(true)
        if (copiedTimer.current) clearTimeout(copiedTimer.current)
        // The couldn't-replace result stays marked as copied: it is on the clipboard.
        if (!couldNotReplace) {
          copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
        }
      })
      .catch(() => {})
  }, [couldNotReplace, text])

  const insert = useCallback(() => {
    if (!text || inserting) return
    setInserting(true)
    setInsertFailed(false)
    insertAskText(text)
      .catch(() => setInsertFailed(true))
      .finally(() => setInserting(false))
  }, [inserting, text])

  const aboutHighlight = Boolean(result?.usedSelectedText) && output !== 'needsLiveInfo'
  const question =
    content.kind === 'error' ? (
      <b>{t('askPanel.errorTitle')}</b>
    ) : output === 'openedSearch' ? (
      // A site search never shows the spoken query (it can be private); only the provider.
      <b>{t('ask.title')}</b>
    ) : (
      <>
        {aboutHighlight && `${t('askPanel.aboutHighlight')} · `}
        <b>{content.result.question}</b>
      </>
    )

  let body: React.ReactNode
  let actions: React.ReactNode = null
  if (content.kind === 'error') {
    body = (
      <div className="ask-glass-answer" data-testid="ask-panel-error">
        {content.message}
      </div>
    )
  } else if (output === 'needsLiveInfo') {
    body = (
      <div className="ask-glass-answer" data-testid="ask-needs-live-info">
        <p className="font-semibold">{t('ask.liveTitle')}</p>
        <p className="mt-1 text-white/80">{t('ask.liveBody')}</p>
      </div>
    )
    actions = (
      <button
        type="button"
        className="ask-glass-button ask-glass-button-primary"
        onClick={onAnswerAnyway}
        disabled={answering}
      >
        {answering && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
        {t('ask.answerAnyway')}
      </button>
    )
  } else if (couldNotReplace) {
    body = (
      <>
        <div className="ask-glass-answer">{text}</div>
        <p className="ask-glass-note flex items-center gap-1.5" data-testid="ask-panel-copied-note">
          <AlertTriangle size={12} className="shrink-0" aria-hidden="true" />
          {t('askPanel.couldNotReplace')}
        </p>
      </>
    )
    actions = (
      <>
        <button type="button" className="ask-glass-button" onClick={insert} disabled={inserting}>
          {t('askPanel.tryReplacingAgain')}
        </button>
        <button type="button" className="ask-glass-button ask-glass-button-primary" onClick={copy}>
          {t('askPanel.copied')}
          <Check size={12} aria-hidden="true" />
        </button>
      </>
    )
  } else if (output === 'openedSearch') {
    body = <div className="ask-glass-answer">{text}</div>
  } else {
    body = (
      <>
        <div className="ask-glass-answer">{text}</div>
        {result?.mayBeOutOfDate && (
          <p className="ask-glass-note text-white/55">{t('ask.outOfDateNote')}</p>
        )}
      </>
    )
    const insertTitle = result?.usedSelectedText
      ? t('askPanel.replaceHighlight')
      : t('askPanel.insertAtCursor')
    actions = (
      <>
        <button type="button" className="ask-glass-button" onClick={copy}>
          {copied ? (
            <>
              {t('askPanel.copied')}
              <Check size={12} aria-hidden="true" />
            </>
          ) : (
            t('askPanel.copy')
          )}
        </button>
        <button
          type="button"
          className="ask-glass-button ask-glass-button-primary"
          onClick={insert}
          disabled={inserting}
          title={insertTitle}
          aria-label={insertTitle}
        >
          {t('askPanel.insert')}
        </button>
      </>
    )
  }

  return (
    <section
      role="dialog"
      aria-label={t('askPanel.label')}
      data-testid="ask-floating-note"
      className="ask-glass"
    >
      <div className="flex items-center gap-2 pt-2.5 pr-3 pl-3.5">
        <span className="ask-glass-question" data-testid="ask-panel-question">
          {question}
        </span>
        <button
          type="button"
          className="ask-glass-close"
          onClick={onClose}
          aria-label={t('askPanel.close')}
          title={t('askPanel.close')}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
      {body}
      {insertFailed && (
        <p className="ask-glass-note mt-1" role="status">
          {t('askPanel.insertFailed')}
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-2 pr-2.5 pb-2.5 pl-3.5">
        <span className="ask-glass-hint">
          <KeyCap name="Escape" className="" /> {t('askPanel.escToClose')}
        </span>
        {actions}
      </div>
    </section>
  )
}
