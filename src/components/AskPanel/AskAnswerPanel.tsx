import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, MessageCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  copyAskText,
  insertAskText,
  openAskSource,
  openSettingsPane,
  startAskFollowUp,
} from '../../lib/tauri'
import type { AskDictationResult, AskSource } from '../../lib/tauri'
import { answerSegments, liveBodyKey } from './liveSearch'
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

/** The host name of a link, without `www.`, for a compact source chip. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function openSource(url: string) {
  openAskSource(url).catch(() => {})
}

/**
 * Plan `ask-web-search`: the web pages an answer came from, numbered as the answer cites them:
 * the page title (cut short) and its domain. A click opens the page in the browser (through the
 * app: the panel never takes focus).
 */
export function AskSources({ sources }: { sources: AskSource[] }) {
  const { t } = useTranslation()
  if (sources.length === 0) return null
  return (
    <div className="ask-glass-sources" data-testid="ask-panel-sources">
      <span className="ask-glass-sources-label">{t('askPanel.sources')}</span>
      {sources.map((source) => (
        <button
          key={source.url}
          type="button"
          className="ask-glass-source"
          title={`${source.title}\n${source.url}`}
          onClick={() => openSource(source.url)}
        >
          <span className="ask-glass-source-number">{source.number}</span>
          <span className="ask-glass-source-title">{source.title}</span>
          <span className="ask-glass-source-host">{sourceHost(source.url)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Plan `ask-web-search`: the answer text with each `[n]` citation as a small numbered link that
 * opens the same page as source chip n.
 */
export function AnswerText({ text, sources }: { text: string; sources: AskSource[] }) {
  const { t } = useTranslation()
  if (sources.length === 0) return <>{text}</>
  const byNumber = new Map(sources.map((source) => [source.number, source]))
  return (
    <>
      {answerSegments(text, [...byNumber.keys()]).map((segment, index) => {
        if (typeof segment === 'string') return <span key={index}>{segment}</span>
        const source = byNumber.get(segment)!
        return (
          <button
            key={index}
            type="button"
            className="ask-glass-cite"
            title={`${source.title}\n${source.url}`}
            aria-label={t('askPanel.openSource', { n: segment })}
            onClick={() => openSource(source.url)}
          >
            {segment}
          </button>
        )
      })}
    </>
  )
}

/**
 * Plan `ask-panel-above-pill`: the Ask panel above the pill (see `mock.html` in the plan). One
 * glass panel for every outcome: an answer (Ask follow-up, plan `ask-web-search`), an edit that
 * could not replace the highlight (Try replacing again, Copied ✓), a question that needs live
 * information (Answer anyway), a site search, and errors. The window never takes focus, so every
 * button goes through the app, not the browser.
 */
export function AskAnswerPanel({
  content,
  onClose,
  onAnswerAnyway,
  answering = false,
}: AskAnswerPanelProps) {
  const { t } = useTranslation()
  const [inserting, setInserting] = useState(false)
  const [insertFailed, setInsertFailed] = useState(false)
  const [followUpFailed, setFollowUpFailed] = useState(false)

  const result = content.kind === 'result' ? content.result : null
  const output = result?.output ?? null
  const text = result?.answer ?? ''
  const couldNotReplace = output === 'copiedFallback'

  useEffect(() => {
    setInsertFailed(false)
    setFollowUpFailed(false)
  }, [content])

  // Only the couldn't-replace result has a copy button, and its text is already on the
  // clipboard; pressing it copies again.
  const copy = useCallback(() => {
    if (!text) return
    copyAskText(text).catch(() => {})
  }, [text])

  const insert = useCallback(() => {
    if (!text || inserting) return
    setInserting(true)
    setInsertFailed(false)
    insertAskText(text)
      .catch(() => setInsertFailed(true))
      .finally(() => setInserting(false))
  }, [inserting, text])

  // Plan `ask-web-search`: records a new question with this answer as its context. The
  // recording closes the panel; the pill shows a Follow-up chip.
  const followUp = useCallback(() => {
    setFollowUpFailed(false)
    startAskFollowUp().catch(() => setFollowUpFailed(true))
  }, [])

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
        {result?.followUp && `${t('askPanel.followUpLabel')} · `}
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
    const notConfigured = (result?.liveSearch ?? 'notConfigured') === 'notConfigured'
    body = (
      <div className="ask-glass-answer" data-testid="ask-needs-live-info">
        <p className="font-semibold">{t('ask.liveTitle')}</p>
        <p className="mt-1 text-white/80">{t(liveBodyKey(result?.liveSearch))}</p>
      </div>
    )
    actions = (
      <>
        {notConfigured && (
          <button
            type="button"
            className="ask-glass-button"
            onClick={() => {
              openSettingsPane('search')
                .then(onClose)
                .catch(() => {})
            }}
          >
            {t('ask.setUpWebSearch')}
          </button>
        )}
        <button
          type="button"
          className="ask-glass-button ask-glass-button-primary"
          onClick={onAnswerAnyway}
          disabled={answering}
        >
          {answering && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
          {t('ask.answerAnyway')}
        </button>
      </>
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
        <div className="ask-glass-answer" data-testid="ask-panel-answer">
          <AnswerText text={text} sources={result?.sources ?? []} />
        </div>
        <AskSources sources={result?.sources ?? []} />
        {result?.mayBeOutOfDate && (
          <p className="ask-glass-note text-white/55">{t('ask.outOfDateNote')}</p>
        )}
        {followUpFailed && (
          <p className="ask-glass-note mt-1" role="status">
            {t('askPanel.followUpFailed')}
          </p>
        )}
      </>
    )
    // Plan `ask-web-search`: an answer offers only Ask follow-up (no Copy or Insert).
    actions = (
      <button
        type="button"
        className="ask-glass-button ask-glass-button-primary"
        onClick={followUp}
      >
        <MessageCircle size={12} aria-hidden="true" />
        {t('askPanel.askFollowUp')}
      </button>
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
