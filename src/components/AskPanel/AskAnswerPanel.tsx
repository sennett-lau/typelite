import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, ExternalLink, Link2, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyAskText, insertAskText, openAskSource, openSettingsPane } from '../../lib/tauri'
import type { AskDictationResult, AskPanelLimits, AskSource } from '../../lib/tauri'
import {
  FALLBACK_LIMITS,
  answerSegments,
  isLongAnswer,
  liveBodyKey,
  panelWidth,
} from './liveSearch'
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
  /** Plan `ask-web-search`: the largest panel on this screen (from the app). */
  limits?: AskPanelLimits | null
}

/** The host name of a link, without `www.`, for a compact source chip. */
function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The sources column's slide-out (`ask-sources-out` in globals.css). */
const SOURCES_SLIDE_OUT_MS = 180

/** How long "Opened ✓" and "Copied ✓" stay on a source card. */
const CONFIRM_MS = 1500

function openSource(url: string) {
  openAskSource(url).catch(() => {})
}

/** A letter mark for a site: its first letter on a colour taken from its name. Typelite shows
 * no site icons, because loading one would contact the site. */
function SiteMark({ url }: { url: string }) {
  const host = sourceHost(url)
  let hash = 0
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return (
    <span
      className="ask-site-mark"
      style={{ background: `hsl(${hash % 360} 55% 42%)` }}
      aria-hidden="true"
    >
      {host.charAt(0).toUpperCase()}
    </span>
  )
}

/**
 * Plan `ask-web-search`: "3 sources" in the footer, with a mark per site. Opens and closes the
 * sources column.
 */
export function AskSourcesSummary({
  sources,
  open,
  onToggle,
}: {
  sources: AskSource[]
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  if (sources.length === 0) return null
  return (
    <button
      type="button"
      className="ask-sources-summary"
      aria-expanded={open}
      onClick={onToggle}
      data-testid="ask-panel-sources-summary"
    >
      <span className="ask-sources-stack">
        {sources.map((source) => (
          <SiteMark key={source.url} url={source.url} />
        ))}
      </span>
      {t('askPanel.sourcesCount', { count: sources.length })}
    </button>
  )
}

/**
 * Plan `ask-web-search`: the sources column on the right, full height. One card per source:
 * site, citation number, title and snippet. Hover shows Open and Copy link; a click on the card
 * opens the page. Both go through the app (the panel never takes focus).
 */
export function AskSourcesColumn({
  sources,
  highlighted,
  onHide,
  closing = false,
}: {
  sources: AskSource[]
  highlighted: number | null
  onHide: () => void
  /** Sliding out; the panel keeps its width until it is gone. */
  closing?: boolean
}) {
  const { t } = useTranslation()
  const [confirmed, setConfirmed] = useState<{ number: number; action: 'open' | 'copy' } | null>(
    null,
  )
  useEffect(() => {
    if (!confirmed) return
    const timer = setTimeout(() => setConfirmed(null), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmed])

  const open = (source: AskSource) => {
    openSource(source.url)
    setConfirmed({ number: source.number, action: 'open' })
  }
  const copyLink = (source: AskSource) => {
    copyAskText(source.url)
      .then(() => setConfirmed({ number: source.number, action: 'copy' }))
      .catch(() => {})
  }

  return (
    <aside
      className={`ask-sources-column${closing ? ' is-closing' : ''}`}
      data-testid="ask-panel-sources"
      data-closing={closing || undefined}
    >
      <div className="ask-sources-head">
        <span>{t('askPanel.sources')}</span>
        <button
          type="button"
          className="ask-glass-close"
          onClick={onHide}
          aria-label={t('askPanel.hideSources')}
          title={t('askPanel.hideSources')}
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="ask-sources-list">
        {sources.map((source) => {
          const done = confirmed?.number === source.number ? confirmed.action : null
          return (
            <div
              key={source.url}
              className={`ask-source-card${highlighted === source.number ? ' is-highlighted' : ''}${done ? ' is-confirming' : ''}`}
              data-testid={`ask-source-${source.number}`}
              onClick={() => open(source)}
            >
              <span className="ask-source-site">
                <SiteMark url={source.url} />
                <span className="ask-source-host">{sourceHost(source.url)}</span>
                <span className="ask-source-number">{source.number}</span>
              </span>
              <span className="ask-source-title">{source.title}</span>
              {source.snippet && <span className="ask-source-snippet">{source.snippet}</span>}
              <span className="ask-source-actions">
                <button
                  type="button"
                  className={`ask-source-action${done === 'open' ? ' is-done' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    open(source)
                  }}
                  aria-label={t('askPanel.openSource', { n: source.number })}
                >
                  {done === 'open' ? (
                    <>
                      {t('askPanel.opened')} <Check size={11} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <ExternalLink size={11} aria-hidden="true" /> {t('askPanel.open')}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className={`ask-source-action${done === 'copy' ? ' is-done' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    copyLink(source)
                  }}
                  aria-label={t('askPanel.copySourceLink', { n: source.number })}
                >
                  {done === 'copy' ? (
                    <>
                      {t('askPanel.linkCopied')} <Check size={11} aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      <Link2 size={11} aria-hidden="true" /> {t('askPanel.copyLink')}
                    </>
                  )}
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

/**
 * Plan `ask-web-search`: the answer text with each `[n]` citation as a small numbered button.
 * Clicking it shows source n in the sources column; hovering it highlights that card.
 */
export function AnswerText({
  text,
  sources,
  onCite,
  onHover,
}: {
  text: string
  sources: AskSource[]
  onCite: (n: number) => void
  onHover: (n: number | null) => void
}) {
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
            title={`${source.title}\n${sourceHost(source.url)}`}
            aria-label={t('askPanel.showSource', { n: segment })}
            onClick={() => onCite(segment)}
            onMouseEnter={() => onHover(segment)}
            onMouseLeave={() => onHover(null)}
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
 * glass panel for every outcome: an answer (with its sources, plan `ask-web-search`), an edit that
 * could not replace the highlight (Try replacing again, Copied ✓), a question that needs live
 * information (Answer anyway), a site search, and errors. The window never takes focus, so every
 * button goes through the app, not the browser.
 */
export function AskAnswerPanel({
  content,
  onClose,
  onAnswerAnyway,
  answering = false,
  limits,
}: AskAnswerPanelProps) {
  const { t } = useTranslation()
  const [inserting, setInserting] = useState(false)
  const [insertFailed, setInsertFailed] = useState(false)

  const result = content.kind === 'result' ? content.result : null
  const output = result?.output ?? null
  const text = result?.answer ?? ''
  const couldNotReplace = output === 'copiedFallback'
  const sources = result?.sources ?? []
  const errorMessage = content.kind === 'error' ? content.message : null
  // Plan `ask-web-search`: the sources column, and the source a citation points at.
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [highlighted, setHighlighted] = useState<number | null>(null)
  // The column slides out before it goes, so the panel shrinks only afterwards.
  const [sourcesClosing, setSourcesClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopClosing = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setSourcesClosing(false)
  }, [])
  const hideSources = useCallback(() => {
    setSourcesOpen(false)
    setHighlighted(null)
    setSourcesClosing(true)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setSourcesClosing(false)
    }, SOURCES_SLIDE_OUT_MS)
  }, [])
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  useEffect(() => {
    setInsertFailed(false)
    setSourcesOpen(false)
    stopClosing()
    setHighlighted(null)
    // The parent builds a new `content` object on each render; reset only for a new message.
  }, [result, errorMessage, stopClosing])

  const showSource = useCallback(
    (n: number) => {
      stopClosing()
      setSourcesOpen(true)
      setHighlighted(n)
    },
    [stopClosing],
  )

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
          <AnswerText text={text} sources={sources} onCite={showSource} onHover={setHighlighted} />
        </div>
        {result?.mayBeOutOfDate && (
          <p className="ask-glass-note text-white/55">{t('ask.outOfDateNote')}</p>
        )}
      </>
    )
    // Plan `ask-web-search`: an answer offers only its sources (no Copy, Insert or other button).
  }

  const panelLimits = limits ?? FALLBACK_LIMITS
  const showColumn = sourcesOpen && sources.length > 0
  const columnShown = (showColumn || sourcesClosing) && sources.length > 0
  const width = panelWidth(isLongAnswer(text), columnShown, panelLimits)

  return (
    <section
      role="dialog"
      aria-label={t('askPanel.label')}
      data-testid="ask-floating-note"
      className="ask-glass"
      style={{ width, maxHeight: panelLimits.maxHeight }}
    >
      {/* Plan `ask-web-search`: the pill's aurora behind the glass. */}
      <div className="ask-glass-aurora" aria-hidden="true">
        <div className="ask-glass-blob ask-glass-blob-a" />
        <div className="ask-glass-blob ask-glass-blob-b" />
      </div>
      <div className="ask-glass-main">
        <div className="flex items-center gap-2 pt-2.5 pr-2 pl-3.5">
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
            <X size={13} aria-hidden="true" />
          </button>
        </div>
        {body}
        {insertFailed && (
          <p className="ask-glass-note mt-1" role="status">
            {t('askPanel.insertFailed')}
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-2 pr-2.5 pb-2.5 pl-3.5">
          <AskSourcesSummary
            sources={sources}
            open={showColumn}
            onToggle={() => {
              if (showColumn) {
                hideSources()
              } else {
                stopClosing()
                setSourcesOpen(true)
                setHighlighted(null)
              }
            }}
          />
          <span className="ask-glass-hint">
            <KeyCap name="Escape" className="" /> {t('askPanel.escToClose')}
          </span>
          {actions}
        </div>
      </div>
      {columnShown && (
        <AskSourcesColumn
          sources={sources}
          highlighted={highlighted}
          onHide={hideSources}
          closing={!showColumn}
        />
      )}
    </section>
  )
}
