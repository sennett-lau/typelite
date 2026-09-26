import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, X } from 'lucide-react'
import { targetLanguageLabel } from '../../../lib/constants'
import {
  downloadLanguagePreset,
  loadLanguagePreset,
  type LibraryStatus,
  type PresetDetail,
} from '../../../lib/tauri'
import {
  LANGUAGE_USER_HINTS_MAX,
  LANGUAGE_USER_HINT_MAX_CHARS,
  TRANSLATION_INSTRUCTIONS_MAX_CHARS,
  languageSettings,
  useAppStore,
  type LibraryPresetRef,
} from '../../../stores/appStore'
import { Toggle } from '../shared/Toggle'
import { loadTranslationDefaults, saveTranslationLanguage } from '../translationLanguages'
import { newerVersion, recentAutoUpdate } from './languageLibrary'
import { PresetBrowser, PresetPreview, TierBadge, type BrowseChoice } from './PresetBrowser'
import { useAnimatedHeight } from './useAnimatedHeight'

type Tab = 'instructions' | 'recognition'
type Screen = 'main' | 'browse' | 'preview'

/** What Preview shows and what "Use this preset" applies. */
type PreviewTarget =
  | { kind: 'builtin' }
  | { kind: 'preset'; detail: PresetDetail | null; error: string | null }

function refOf(detail: PresetDetail): LibraryPresetRef {
  return { id: detail.id, version: detail.version, sha256: detail.sha256 }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A language's name in the UI language, for a speech code (`zh` → Chinese). */
function speechLanguageName(code: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Plan `language-prompt-library`: the sheet behind a language row's Edit button. Header: the
 * name and code, and the language's on/off switch. Off: a short note and Done. On: the
 * Instructions tab (where the text comes from, the text, automatic updates and update banners)
 * and the Recognition tab (the preset's speech codes and hints, plus the user's own hints).
 * Browse and Preview replace the content in place. Save writes only this language's settings.
 */
export function LanguageSheet({
  code,
  status,
  onClose,
}: {
  code: string
  status: LibraryStatus
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const stored = useMemo(() => {
    const { config, savedConfig } = useAppStore.getState()
    return languageSettings(savedConfig ?? config, code)
  }, [code])
  const name = targetLanguageLabel(code, t)

  const [enabled, setEnabled] = useState(stored.enabled)
  const [tab, setTab] = useState<Tab>('instructions')
  const [screen, setScreen] = useState<Screen>('main')
  const [preset, setPreset] = useState<LibraryPresetRef | null>(stored.library_preset)
  const [presetDetail, setPresetDetail] = useState<PresetDetail | null>(null)
  const [presetMissing, setPresetMissing] = useState(false)
  const [defaultText, setDefaultText] = useState<string | null>(null)
  const [defaultsFailed, setDefaultsFailed] = useState(false)
  const [text, setText] = useState<string | null>(stored.instructions)
  const [autoUpdate, setAutoUpdate] = useState(stored.auto_update)
  const [userHints, setUserHints] = useState<string[]>(stored.user_hints)
  const [hintDraft, setHintDraft] = useState('')
  const [browseChoice, setBrowseChoice] = useState<BrowseChoice>({ kind: 'builtin' })
  const [preview, setPreview] = useState<PreviewTarget | null>(null)
  const [previewBack, setPreviewBack] = useState<Screen>('browse')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // The built-in default of this language.
  useEffect(() => {
    let cancelled = false
    loadTranslationDefaults()
      .then((defaults) => {
        if (!cancelled) setDefaultText(defaults[code] ?? '')
      })
      .catch(() => {
        if (!cancelled) {
          setDefaultsFailed(true)
          setDefaultText('')
        }
      })
    return () => {
      cancelled = true
    }
  }, [code])

  // The stored preset, rendered for this language.
  useEffect(() => {
    const initial = stored.library_preset
    if (!initial) return
    let cancelled = false
    Promise.resolve(loadLanguagePreset(initial.id, initial.sha256, code))
      .then((detail) => {
        if (cancelled) return
        setPresetDetail(detail ?? null)
        setPresetMissing(!detail)
      })
      .catch(() => {
        if (!cancelled) setPresetMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [code, stored.library_preset])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // The text the user starts from: the rendered preset, or the built-in default.
  const presetLoading = Boolean(preset) && !presetDetail && !presetMissing
  const baseText = preset && presetDetail ? presetDetail.text : defaultText
  const ready = baseText !== null && !presetLoading
  const value = text ?? baseText ?? ''
  const edited = ready && text !== null && text.trim() !== (baseText ?? '').trim()
  const newer = newerVersion(preset, status)
  const autoRecord = recentAutoUpdate(code, preset, status)
  const presetName = presetDetail?.name ?? preset?.id ?? ''

  // The content fades in when the screen, tab or switch changes; the height also follows
  // banners and loading states.
  const contentKey = `${enabled}:${tab}:${screen}`
  const heightKey = `${contentKey}:${busy}:${newer}:${edited}:${presetMissing}:${preview?.kind}:${
    preview?.kind === 'preset' ? Boolean(preview.detail) : ''
  }`
  const heightRef = useAnimatedHeight<HTMLDivElement>(heightKey)

  const fetchPreset = async (id: string): Promise<PresetDetail> => downloadLanguagePreset(id, code)

  /** Switches the sheet to a preset version (not saved until Save). */
  const applyPreset = (detail: PresetDetail, keepText: boolean) => {
    setPreset(refOf(detail))
    setPresetDetail(detail)
    setPresetMissing(false)
    if (!keepText) setText(null)
  }

  const runBusy = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  const openPreview = (target: PreviewTarget, back: Screen) => {
    setPreview(target)
    setPreviewBack(back)
    setScreen('preview')
  }

  /** Preview the newest version of the current preset (update banners). */
  const previewNewest = async () => {
    if (!preset) return
    openPreview({ kind: 'preset', detail: null, error: null }, 'main')
    try {
      const detail = await fetchPreset(preset.id)
      setPreview({ kind: 'preset', detail, error: null })
    } catch (failure) {
      setPreview({ kind: 'preset', detail: null, error: errorText(failure) })
    }
  }

  const previewBrowseChoice = async () => {
    if (browseChoice.kind === 'builtin') {
      openPreview({ kind: 'builtin' }, 'browse')
      return
    }
    openPreview({ kind: 'preset', detail: null, error: null }, 'browse')
    try {
      const detail = await fetchPreset(browseChoice.listing.id)
      setPreview({ kind: 'preset', detail, error: null })
    } catch (failure) {
      setPreview({ kind: 'preset', detail: null, error: errorText(failure) })
    }
  }

  const applyPreview = () => {
    if (!preview) return
    if (preview.kind === 'builtin') {
      setPreset(null)
      setPresetDetail(null)
      setPresetMissing(false)
      setText(null)
    } else if (preview.detail) {
      applyPreset(preview.detail, false)
    }
    setScreen('main')
    setTab('instructions')
  }

  const resetToPreset = () => setText(null)
  const resetToDefault = () => {
    setPreset(null)
    setPresetDetail(null)
    setPresetMissing(false)
    setText(null)
  }

  const addHint = () => {
    const hint = hintDraft.trim().slice(0, LANGUAGE_USER_HINT_MAX_CHARS)
    setHintDraft('')
    if (!hint || userHints.includes(hint) || presetDetail?.hints.includes(hint)) return
    if (userHints.length >= LANGUAGE_USER_HINTS_MAX) return
    setUserHints([...userHints, hint])
  }

  const onHintKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      addHint()
    }
  }

  const save = async (settings: Parameters<typeof saveTranslationLanguage>[1]) => {
    setSaving(true)
    setError(null)
    try {
      await saveTranslationLanguage(code, settings)
      onClose()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (!ready || saving) return
    const trimmed = value.trim()
    void save({
      instructions: edited && trimmed !== '' ? trimmed : null,
      library_preset: preset,
      enabled,
      auto_update: preset ? autoUpdate : false,
      user_hints: userHints,
    })
  }

  const handleDone = () => {
    if (saving) return
    if (stored.enabled === enabled) {
      onClose()
      return
    }
    void save({ ...stored, enabled })
  }

  const header = (
    <div className="language-sheet-head">
      <h3 className="m-0 min-w-0 text-[15px] font-bold text-text-primary">
        {name} <span className="text-[12px] font-normal text-text-secondary">{code}</span>
      </h3>
      <span className="language-sheet-switch">
        {enabled ? t('translate.language.on') : t('translate.language.off')}
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          label={t('translate.language.switchLabel', { language: name })}
          hideLabel
        />
      </span>
    </div>
  )

  const errorLine = error && (
    <span className="min-w-0 break-words text-[12px] text-error" role="alert">
      {error}
    </span>
  )

  const renderMain = () => {
    if (!enabled) {
      return (
        <>
          {header}
          <p className="language-note">{t('translate.language.offNote', { language: name })}</p>
          <div className="language-sheet-foot">
            <span className="flex-1" />
            {errorLine}
            <button
              type="button"
              onClick={handleDone}
              disabled={saving}
              className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
            >
              {t('translate.language.done')}
            </button>
          </div>
        </>
      )
    }
    const tabs = (
      <div role="tablist" aria-label={name} className="segmented self-start">
        {(['instructions', 'recognition'] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className="segmented-item"
          >
            {id === 'instructions'
              ? t('translate.language.tabInstructions')
              : t('translate.language.tabRecognition')}
          </button>
        ))}
      </div>
    )
    const footer = (
      <div className="language-sheet-foot">
        {tab === 'instructions' && preset && edited && (
          <button type="button" onClick={resetToPreset} className="link-button text-[12px]">
            {t('translate.language.resetToPreset')}
          </button>
        )}
        {tab === 'instructions' && (preset || edited) && (
          <button
            type="button"
            onClick={resetToDefault}
            className="link-button text-[12px] text-text-secondary"
          >
            {t('translate.language.resetToDefault')}
          </button>
        )}
        <span className="flex-1" />
        {errorLine}
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary px-3.5 py-1.5 text-[13px] font-medium"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!ready || saving || busy}
          className="btn-accent px-3.5 py-1.5 text-[13px] font-medium"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {t('common.save')}
        </button>
      </div>
    )
    if (tab === 'recognition') {
      return (
        <>
          {header}
          {tabs}
          {renderRecognition()}
          {footer}
        </>
      )
    }
    return (
      <>
        {header}
        {tabs}
        {renderBanner()}
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="language-section-label">{t('translate.language.instructions')}</span>
          <p className="m-0 text-[12px] text-text-secondary">
            {t('translate.language.instructionsHelp', { language: name })}
          </p>
          {renderSourceLine()}
          <textarea
            aria-label={t('translate.language.instructions')}
            value={value}
            disabled={!ready}
            onChange={(event) => setText(event.target.value)}
            maxLength={TRANSLATION_INSTRUCTIONS_MAX_CHARS}
            rows={8}
            spellCheck={false}
            className="field w-full resize-y font-mono text-[11.5px]"
          />
          <span className="text-right text-[11px] text-text-tertiary">
            {defaultsFailed
              ? t('translate.language.defaultsFailed')
              : t('translate.language.count', {
                  count: value.length,
                  max: TRANSLATION_INSTRUCTIONS_MAX_CHARS,
                })}
          </span>
          {preset && (
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={autoUpdate}
                onChange={(event) => setAutoUpdate(event.target.checked)}
                className="mt-[3px]"
              />
              <span>
                {t('translate.language.autoUpdate')}
                <small className="block text-[11.5px] text-text-tertiary">
                  {edited
                    ? t('translate.language.autoUpdateEdited')
                    : t('translate.language.autoUpdateHelp')}
                </small>
              </span>
            </label>
          )}
          <span className="text-[11.5px] text-text-secondary">
            {t('translate.language.contractNote')}
          </span>
        </div>
        {footer}
      </>
    )
  }

  const renderSourceLine = () => {
    if (!preset) {
      return (
        <div className="language-source-line">
          <span>{t('translate.language.from')}</span>
          <b>{t('translate.language.builtinDefault')}</b>
          <span className="flex-1" />
          <button type="button" onClick={() => openBrowse()} className="link-button text-[12px]">
            {t('translate.language.browse')}
          </button>
        </div>
      )
    }
    return (
      <>
        <div className="language-source-line">
          <span>{edited ? t('translate.language.basedOn') : t('translate.language.from')}</span>
          <b>{presetName}</b>
          <span>· v{preset.version}</span>
          {presetDetail && <TierBadge tier={presetDetail.tier} />}
          {edited && <span className="tag tag-edited">{t('translate.language.edited')}</span>}
          <span className="flex-1" />
          <button type="button" onClick={() => openBrowse()} className="link-button text-[12px]">
            {t('translate.language.change')}
          </button>
        </div>
        {presetMissing && (
          <div className="language-banner language-banner-warn">
            <span className="flex-1">{t('translate.language.missingNote')}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runBusy(async () => applyPreset(await fetchPreset(preset.id), text !== null))
              }
              className="btn-secondary px-2.5 py-1 text-[12px]"
            >
              {t('translate.language.downloadAgain')}
            </button>
          </div>
        )}
      </>
    )
  }

  const renderBanner = () => {
    if (!preset || !ready) return null
    if (newer !== null && edited) {
      return (
        <div className="language-banner" role="status">
          <span className="min-w-[160px] flex-1">
            {t('translate.language.updateEdited', { version: newer })}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBusy(async () => applyPreset(await fetchPreset(preset.id), true))}
            className="btn-secondary px-2.5 py-1 text-[12px]"
          >
            {t('translate.language.keepMine')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={previewNewest}
            className="btn-accent px-2.5 py-1 text-[12px]"
          >
            {t('translate.language.useVersion', { version: newer })}
          </button>
        </div>
      )
    }
    if (newer !== null) {
      return (
        <div className="language-banner" role="status">
          <span className="min-w-[160px] flex-1">
            {t('translate.language.updateAvailable', { version: newer, name: presetName })}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={previewNewest}
            className="btn-secondary px-2.5 py-1 text-[12px]"
          >
            {t('translate.language.preview')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBusy(async () => applyPreset(await fetchPreset(preset.id), false))}
            className="btn-accent px-2.5 py-1 text-[12px]"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {t('translate.language.update')}
          </button>
        </div>
      )
    }
    if (autoRecord && autoUpdate && !edited) {
      return (
        <div className="language-banner" role="status">
          <span className="min-w-[160px] flex-1">
            {t('translate.language.updatedAuto', { version: autoRecord.to })}
          </span>
          <button
            type="button"
            onClick={() =>
              openPreview({ kind: 'preset', detail: presetDetail, error: null }, 'main')
            }
            className="link-button text-[12px]"
          >
            {t('translate.language.seeText')}
          </button>
        </div>
      )
    }
    return null
  }

  const renderRecognition = () => {
    const codes = presetDetail?.detect_codes ?? []
    const presetHints = presetDetail?.hints ?? []
    const general = codes[codes.length - 1]
    return (
      <>
        <p className="m-0 text-[12px] text-text-secondary">
          {t('translate.language.recognitionHelp')}
        </p>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="language-section-label">{t('translate.language.hears')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {codes.length > 0 ? (
              <>
                {codes.map((speechCode) => (
                  <span key={speechCode} className="hint-chip hint-chip-code">
                    {speechCode}
                  </span>
                ))}
                <span className="text-[11.5px] text-text-secondary">
                  {t('translate.language.fromThePreset')}
                </span>
                {presetDetail?.require_hint && general && (
                  <span className="text-[11.5px] text-text-secondary">
                    {t('translate.language.countsOnlyWithHint', {
                      language: speechLanguageName(general, i18n?.language ?? 'en'),
                    })}
                  </span>
                )}
              </>
            ) : (
              <span className="text-[12px] text-text-secondary">
                {t('translate.language.noDetection')}
              </span>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="language-section-label">{t('translate.language.hintsLabel')}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {presetHints.length === 0 && codes.length > 0 && (
              <span className="text-[12px] text-text-secondary">
                {t('translate.language.hintsNone')}
              </span>
            )}
            {presetHints.map((hint) => (
              <span key={hint} className="hint-chip" title={t('translate.language.hintFromPreset')}>
                {hint}
              </span>
            ))}
            {userHints.map((hint) => (
              <span
                key={hint}
                className="hint-chip hint-chip-mine"
                title={t('translate.language.hintMine')}
              >
                {hint}
                <button
                  type="button"
                  onClick={() => setUserHints(userHints.filter((other) => other !== hint))}
                  aria-label={t('translate.language.removeHint', { hint })}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={hintDraft}
              onChange={(event) => setHintDraft(event.target.value)}
              onKeyDown={onHintKey}
              maxLength={LANGUAGE_USER_HINT_MAX_CHARS}
              placeholder={t('translate.language.addHint')}
              aria-label={t('translate.language.addHintLabel')}
              className="hint-input"
            />
          </div>
        </div>
      </>
    )
  }

  const openBrowse = () => {
    setBrowseChoice(
      presetDetail ? { kind: 'preset', listing: listingOf(presetDetail) } : { kind: 'builtin' },
    )
    setScreen('browse')
  }

  const renderPreview = () => {
    if (!preview) return null
    if (preview.kind === 'builtin') {
      return (
        <PresetPreview
          title={t('translate.language.builtinItem')}
          tier={null}
          meta={null}
          text={defaultText ?? ''}
          variant={null}
          onBack={() => setScreen(previewBack)}
          onUse={applyPreview}
        />
      )
    }
    const detail = preview.detail
    return (
      <PresetPreview
        title={detail?.name ?? presetName}
        tier={detail?.tier ?? null}
        meta={
          detail
            ? t('translate.language.presetMeta', {
                summary: detail.summary,
                version: detail.version,
                authors: detail.authors.join(', '),
              })
            : null
        }
        text={detail?.text ?? ''}
        variant={detail?.variant ?? null}
        busy={!detail && !preview.error}
        error={preview.error}
        onBack={() => setScreen(previewBack)}
        onUse={applyPreview}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-5 pt-14 pb-5">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={heightRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        data-testid="language-sheet"
        className="dialog language-sheet relative z-10 w-full max-w-[520px]"
      >
        <div className="max-h-[85vh] overflow-y-auto">
          <div key={contentKey} className="language-sheet-body">
            {screen === 'main' && renderMain()}
            {screen === 'browse' && (
              <PresetBrowser
                code={code}
                languageName={name}
                selected={browseChoice.kind === 'builtin' ? 'builtin' : browseChoice.listing.id}
                onSelect={setBrowseChoice}
                onBack={() => setScreen('main')}
                onPreview={previewBrowseChoice}
              />
            )}
            {screen === 'preview' && renderPreview()}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A Browse list item for the preset in use, so it shows as selected. */
function listingOf(detail: PresetDetail) {
  return {
    id: detail.id,
    name: detail.name,
    tier: detail.tier,
    summary: detail.summary,
    languages: [],
    variant: detail.variant,
    version: detail.version,
    authors: detail.authors,
    model_hint: detail.model_hint,
    downloaded: true,
  }
}
