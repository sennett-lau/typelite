import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { listLanguagePresets, type PresetList, type PresetListing } from '../../../lib/tauri'
import { LANGUAGE_LIBRARY_URL } from './languageLibrary'

/** What the Browse list can select: the built-in default or a library preset. */
export type BrowseChoice = { kind: 'builtin' } | { kind: 'preset'; listing: PresetListing }

interface PresetBrowserProps {
  code: string
  languageName: string
  /** The id of the chosen item: `builtin` or a preset id. */
  selected: string
  onSelect: (choice: BrowseChoice) => void
  onBack: () => void
  /** Preview the selected item (nothing is used before "Use this preset"). */
  onPreview: () => void
}

/** The tier badge text and class. */
export function TierBadge({ tier }: { tier: string }) {
  const { t } = useTranslation()
  const official = tier === 'official'
  return (
    <span className={official ? 'tag' : 'tag tag-neutral'}>
      {official ? t('translate.language.official') : t('translate.language.community')}
    </span>
  )
}

/**
 * Plan `language-prompt-library`: the Browse screen of the language sheet. Built-in default
 * first, then the matching presets best first (Official, most specific language), each with its
 * tier, summary, languages or regional note, version, authors, model hint and whether it is
 * downloaded; related presets below. Offline it lists what is downloaded, with Try again.
 */
export function PresetBrowser({
  code,
  languageName,
  selected,
  onSelect,
  onBack,
  onPreview,
}: PresetBrowserProps) {
  const { t } = useTranslation()
  const [list, setList] = useState<PresetList | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    Promise.resolve(listLanguagePresets(code))
      .then((next) => setList(next ?? { presets: [], related: [], offline: true }))
      .catch(() => setList({ presets: [], related: [], offline: true }))
      .finally(() => setLoading(false))
  }, [code])

  useEffect(load, [load])

  return (
    <>
      <div className="language-sheet-head">
        <h3 className="m-0 text-[15px] font-bold text-text-primary">
          {t('translate.language.browseTitle', { language: languageName })}
        </h3>
        <button
          type="button"
          onClick={() =>
            openUrl(LANGUAGE_LIBRARY_URL).catch((error) =>
              console.error('[settings] failed to open the library', error),
            )
          }
          className="link-button text-[12px]"
        >
          {t('translate.language.libraryLink')}
        </button>
      </div>

      {list?.offline && !loading && (
        <div className="language-banner language-banner-warn" role="status">
          <span className="flex-1">{t('translate.language.offline')}</span>
          <button type="button" onClick={load} className="btn-secondary px-2.5 py-1 text-[12px]">
            {t('translate.language.tryAgain')}
          </button>
        </div>
      )}

      <div role="radiogroup" aria-label={t('translate.language.browse')} className="preset-list">
        <button
          type="button"
          role="radio"
          aria-checked={selected === 'builtin'}
          onClick={() => onSelect({ kind: 'builtin' })}
          className="preset-item"
        >
          <span className="preset-item-title">
            {t('translate.language.builtinItem')}
            <span className="tag tag-neutral">{t('translate.language.builtinTag')}</span>
          </span>
          <span className="preset-item-summary">{t('translate.language.builtinSummary')}</span>
        </button>
        {list?.presets.map((listing) => (
          <button
            key={listing.id}
            type="button"
            role="radio"
            aria-checked={selected === listing.id}
            onClick={() => onSelect({ kind: 'preset', listing })}
            className="preset-item"
          >
            <span className="preset-item-title">
              {listing.name}
              <TierBadge tier={listing.tier} />
              {listing.downloaded && (
                <span className="tag tag-neutral">{t('translate.language.downloaded')}</span>
              )}
            </span>
            <span className="preset-item-summary">{listing.summary}</span>
            <span className="preset-item-meta">
              {[
                listing.variant
                  ? `${listing.languages.join(', ')} · ${t('translate.language.notesFor', { variant: listing.variant })}`
                  : listing.languages.join(', '),
                `v${listing.version}`,
                t('translate.language.byAuthors', { authors: listing.authors.join(', ') }),
                listing.model_hint,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
        {loading && (
          <span className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Loader2 size={12} className="animate-spin" />
            {t('translate.language.loading')}
          </span>
        )}
      </div>
      {list && list.related.length > 0 && (
        <p className="m-0 text-[12px] text-text-secondary">
          {t('translate.language.related', { names: list.related.join(' · ') })}
        </p>
      )}

      <div className="language-sheet-foot">
        <span className="text-[12px] text-text-secondary">
          {t('translate.language.nothingUsed')}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('translate.language.back')}
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('translate.language.preview')}
        </button>
      </div>
    </>
  )
}

interface PresetPreviewProps {
  title: string
  tier: string | null
  /** "summary · vN · by authors · CC0", or nothing for the built-in default. */
  meta: string | null
  text: string
  variant: string | null
  busy?: boolean
  error?: string | null
  onBack: () => void
  onUse: () => void
}

/**
 * Plan `language-prompt-library`: the Preview screen: the full rendered text, with the regional
 * note, read-only, before anything is used.
 */
export function PresetPreview({
  title,
  tier,
  meta,
  text,
  variant,
  busy = false,
  error = null,
  onBack,
  onUse,
}: PresetPreviewProps) {
  const { t } = useTranslation()
  return (
    <>
      <div className="language-sheet-head">
        <h3 className="m-0 text-[15px] font-bold text-text-primary">{title}</h3>
        {tier && <TierBadge tier={tier} />}
      </div>
      {meta && <p className="m-0 text-[12px] text-text-secondary">{meta}</p>}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="language-section-label">
          {variant
            ? t('translate.language.fullTextFor', { variant })
            : t('translate.language.fullText')}
        </span>
        {busy ? (
          <span className="flex items-center gap-2 text-[12px] text-text-secondary">
            <Loader2 size={12} className="animate-spin" />
            {t('translate.language.loading')}
          </span>
        ) : error ? (
          <span className="text-[12px] text-error" role="alert">
            {error}
          </span>
        ) : (
          <div className="preset-preview" data-testid="preset-preview-text">
            {text}
          </div>
        )}
      </div>
      <div className="language-sheet-foot">
        {tier && (
          <span className="text-[12px] text-text-secondary">
            {t('translate.language.verified')}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('translate.language.back')}
        </button>
        <button
          type="button"
          onClick={onUse}
          disabled={busy || Boolean(error)}
          className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('translate.language.usePreset')}
        </button>
      </div>
    </>
  )
}
