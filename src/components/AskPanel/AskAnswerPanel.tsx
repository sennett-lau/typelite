import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check, ChevronRight, ExternalLink, Link2, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { copyAskText, insertAskText, openAskSource, openSettingsPane } from '../../lib/tauri'
import type { AskDictationResult, AskPanelLimits, AskSource } from '../../lib/tauri'
import {
  FALLBACK_LIMITS,
  SOURCES_COLUMN_WIDTH,
  answerSegments,
  isLongAnswer,
  liveBodyKey,
  panelWidth,
} from './liveSearch'
import { KeyCap } from '../ui/KeyCap'
import { textToCopy, useSelectionWithin } from './selection'

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

/** The shell and the source rail share one curve, keeping the answer still as they expand. */
const SOURCES_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }

/**
 * Eases the panel's height to its new value when the sources column opens or closes (the answer
 * re-wraps to a new width), on the same curve as the width.
 */
function useAnimatedPanelHeight(key: boolean, reducedMotion: boolean) {
  const ref = useRef<HTMLElement | null>(null)
  const lastHeight = useRef<number | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const previous = lastHeight.current
    element.style.transition = ''
    element.style.height = ''
    const next = element.offsetHeight
    lastHeight.current = next
    if (previous === null || Math.abs(next - previous) < 2 || reducedMotion) return
    const [a, b, c, d] = SOURCES_TRANSITION.ease
    element.style.height = `${previous}px`
    // Read layout so the browser takes the old height before the transition starts.
    void element.offsetHeight
    element.style.transition = `height ${SOURCES_TRANSITION.duration}s cubic-bezier(${a}, ${b}, ${c}, ${d})`
    element.style.height = `${next}px`
    const timer = setTimeout(
      () => {
        element.style.height = ''
        element.style.transition = ''
      },
      SOURCES_TRANSITION.duration * 1000 + 40,
    )
    return () => clearTimeout(timer)
  }, [key, reducedMotion])
  return ref
}

/** The sources column's rail; it widens from the panel's right edge and narrows back. */
function SourcesRail({
  transition,
  children,
}: {
  transition: { duration: number; ease?: readonly number[] }
  children: React.ReactNode
}) {
  const present = useIsPresent()
  return (
    <motion.div
      className="ask-sources-rail"
      data-exiting={!present || undefined}
      initial={{ width: 0 }}
      animate={{ width: SOURCES_COLUMN_WIDTH }}
      exit={{ width: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  )
}

/** How long a confirmation check stays on a source card. */
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
 * site, citation number, title and snippet. Open and Copy link icons stay visible; a click
 * on the card opens the page. Both go through the app (the panel never takes focus).
 */
export function AskSourcesColumn({
  sources,
  highlighted,
  onHide,
}: {
  sources: AskSource[]
  highlighted: number | null
  onHide: () => void
}) {
  const { t } = useTranslation()
  const present = useIsPresent()
  const reducedMotion = useReducedMotion()
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (highlighted === null) return
    listRef.current
      ?.querySelector(`[data-source-number="${highlighted}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'instant' : 'smooth' })
  }, [highlighted, reducedMotion])
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
    <motion.aside
      className="ask-sources-column"
      data-testid="ask-panel-sources"
      data-closing={!present || undefined}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={{ opacity: 0, x: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: reducedMotion ? 0 : 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}
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
      <div className="ask-sources-list" ref={listRef}>
        {sources.map((source) => {
          const done = confirmed?.number === source.number ? confirmed.action : null
          const openLabel = t(done === 'open' ? 'askPanel.sourceOpened' : 'askPanel.openSource', {
            n: source.number,
          })
          const copyLabel = t(
            done === 'copy' ? 'askPanel.sourceLinkCopied' : 'askPanel.copySourceLink',
            { n: source.number },
          )
          return (
            <div
              key={source.url}
              className={`ask-source-card${highlighted === source.number ? ' is-highlighted' : ''}`}
              data-testid={`ask-source-${source.number}`}
              data-source-number={source.number}
              onClick={() => {
                // Plan `ask-panel-select-text`: a drag that highlights a title is not a click.
                if (document.getSelection()?.toString().trim()) return
                open(source)
              }}
            >
              <span className="ask-source-site">
                <SiteMark url={source.url} />
                <span className="ask-source-host">{sourceHost(source.url)}</span>
                <span className="ask-source-number">{source.number}</span>
                <span className="ask-source-actions">
                  <button
                    type="button"
                    className={`ask-source-action${done === 'open' ? ' is-done' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      open(source)
                    }}
                    aria-label={openLabel}
                    title={openLabel}
                  >
                    {done === 'open' ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <ExternalLink size={13} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={`ask-source-action${done === 'copy' ? ' is-done' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      copyLink(source)
                    }}
                    aria-label={copyLabel}
                    title={copyLabel}
                  >
                    {done === 'copy' ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <Link2 size={13} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </span>
              <span className="ask-source-title">{source.title}</span>
              {source.snippet && <span className="ask-source-snippet">{source.snippet}</span>}
            </div>
          )
        })}
      </div>
    </motion.aside>
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
  const reducedMotion = useReducedMotion()
  const hideSources = useCallback(() => {
    setSourcesOpen(false)
    setHighlighted(null)
  }, [])

  useEffect(() => {
    setInsertFailed(false)
    setSourcesOpen(false)
    setHighlighted(null)
    // The parent builds a new `content` object on each render; reset only for a new message.
  }, [result, errorMessage])

  const showSource = useCallback((n: number) => {
    setSourcesOpen(true)
    setHighlighted(n)
  }, [])

  // Plan `ask-panel-select-text`: the panel is never key, so ⌘C goes to the user's app, not
  // here. A highlight inside the panel shows "Copy selection", which copies through the app.
  const panelRef = useRef<HTMLElement | null>(null)
  const selected = useSelectionWithin(panelRef)
  const [selectionCopied, setSelectionCopied] = useState(false)
  useEffect(() => setSelectionCopied(false), [selected])

  // The couldn't-replace result's button: its text is already on the clipboard; pressing it
  // copies again (only the highlighted part when there is one).
  const copy = useCallback(() => {
    const value = textToCopy(selected, text)
    if (!value) return
    copyAskText(value).catch(() => {})
  }, [selected, text])

  const copySelection = useCallback(() => {
    if (!selected) return
    copyAskText(selected)
      .then(() => setSelectionCopied(true))
      .catch(() => {})
  }, [selected])

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
  const width = panelWidth(isLongAnswer(text), showColumn, panelLimits)
  const transition = reducedMotion ? { duration: 0 } : SOURCES_TRANSITION
  // The answer column takes its final width at once, so its text wraps once instead of on every
  // frame (a long answer already fills the panel, so the open column narrows it).
  const mainWidth = width - (showColumn ? SOURCES_COLUMN_WIDTH : 0)
  const sectionRef = useAnimatedPanelHeight(showColumn, reducedMotion === true)

  return (
    <motion.section
      role="dialog"
      aria-label={t('askPanel.label')}
      data-testid="ask-floating-note"
      className="ask-glass"
      ref={(element: HTMLElement | null) => {
        sectionRef.current = element
        panelRef.current = element
      }}
      initial={false}
      animate={{ width }}
      transition={transition}
      style={{ maxHeight: panelLimits.maxHeight }}
    >
      {/* Plan `ask-web-search`: the pill's aurora behind the glass. */}
      <div className="ask-glass-aurora" aria-hidden="true">
        <div className="ask-glass-blob ask-glass-blob-a" />
        <div className="ask-glass-blob ask-glass-blob-b" />
      </div>
      <div className="ask-glass-main" style={{ width: mainWidth }}>
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
                setSourcesOpen(true)
                setHighlighted(null)
              }
            }}
          />
          <span className="ask-glass-hint">
            <KeyCap name="Escape" className="" /> {t('askPanel.escToClose')}
          </span>
          {selected && !couldNotReplace && (
            <button
              type="button"
              className="ask-glass-button"
              onClick={copySelection}
              data-testid="ask-panel-copy-selection"
            >
              {t(selectionCopied ? 'askPanel.selectionCopied' : 'askPanel.copySelection')}
              {selectionCopied && <Check size={12} aria-hidden="true" />}
            </button>
          )}
          {actions}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {showColumn && (
          <SourcesRail key="sources" transition={transition}>
            <AskSourcesColumn sources={sources} highlighted={highlighted} onHide={hideSources} />
          </SourcesRail>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
