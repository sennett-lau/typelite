import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  getLanguageLibraryStatus,
  loadLanguagePreset,
  type AutoUpdateRecord,
  type LibraryStatus,
  type PresetDetail,
} from '../../../lib/tauri'
import type { LibraryPresetRef, TranslationLanguageSettings } from '../../../stores/appStore'
import { AI_POLISH_GUIDE_URL } from '../../Speech/services'

// Plan `language-prompt-library`: what Settings needs from the language preset library.

/** The guide section behind "About language presets". */
export const LANGUAGE_PRESETS_GUIDE_URL = `${AI_POLISH_GUIDE_URL}#language-presets`
/** The library folder on GitHub ("Library on GitHub" in Browse). */
export const LANGUAGE_LIBRARY_URL =
  'https://github.com/sennett-lau/typelite/tree/main/presets/languages'
/** Emitted by the backend when the library cache or an automatic update changed. */
export const LIBRARY_CHANGED_EVENT = 'language-library:changed'
/** How long the "Updated automatically" banner stays. */
const AUTO_UPDATE_NOTICE_SECONDS = 7 * 24 * 60 * 60

const EMPTY_STATUS: LibraryStatus = { latest: {}, updates: {} }

/** The library status (newest versions, automatic updates), refreshed when it changes. */
export function useLibraryStatus(refreshKey = 0): LibraryStatus {
  const [status, setStatus] = useState<LibraryStatus>(EMPTY_STATUS)
  useEffect(() => {
    let cancelled = false
    const load = () => {
      Promise.resolve(getLanguageLibraryStatus())
        .then((next) => {
          if (!cancelled && next) setStatus(next)
        })
        .catch(() => {
          // No cache yet, or not running in the app: nothing to show.
        })
    }
    load()
    let unlisten: (() => void) | undefined
    try {
      Promise.resolve(listen(LIBRARY_CHANGED_EVENT, load))
        .then((stop) => {
          if (cancelled) stop?.()
          else unlisten = stop
        })
        .catch(() => {})
    } catch {
      // Outside Tauri (tests without a mock).
    }
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [refreshKey])
  return status
}

/** The stored preset a language uses, rendered for it; `missing` when the file is gone. */
export function usePresetDetail(
  code: string,
  preset: LibraryPresetRef | null | undefined,
): { detail: PresetDetail | null; missing: boolean } {
  const [state, setState] = useState<{ key: string; detail: PresetDetail | null }>({
    key: '',
    detail: null,
  })
  const key = preset ? `${code}:${preset.id}:${preset.sha256}` : ''
  useEffect(() => {
    if (!preset) return
    let cancelled = false
    Promise.resolve(loadLanguagePreset(preset.id, preset.sha256, code))
      .then((detail) => {
        if (!cancelled) setState({ key, detail: detail ?? null })
      })
      .catch(() => {
        if (!cancelled) setState({ key, detail: null })
      })
    return () => {
      cancelled = true
    }
    // `key` covers the preset's id and hash.
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const current = state.key === key ? state.detail : null
  return { detail: current, missing: Boolean(preset) && state.key === key && current === null }
}

/** A newer version of the language's preset in the cached index, or null. */
export function newerVersion(
  preset: LibraryPresetRef | null | undefined,
  status: LibraryStatus,
): number | null {
  if (!preset) return null
  const latest = status.latest[preset.id]
  return latest && latest.version > preset.version ? latest.version : null
}

/**
 * True when the row shows the "Update" tag: a newer version exists and it will not apply by
 * itself (the text is edited, or auto-update is off).
 */
export function needsUpdateDecision(
  settings: Required<TranslationLanguageSettings>,
  status: LibraryStatus,
): boolean {
  if (!settings.enabled || newerVersion(settings.library_preset, status) === null) return false
  return settings.instructions !== null || !settings.auto_update
}

/** The automatic update to show as "Updated automatically to vN", if recent. */
export function recentAutoUpdate(
  code: string,
  preset: LibraryPresetRef | null | undefined,
  status: LibraryStatus,
  nowSeconds = Date.now() / 1000,
): AutoUpdateRecord | null {
  const record = status.updates[code]
  if (!preset || !record || record.id !== preset.id || record.to !== preset.version) return null
  return nowSeconds - record.at < AUTO_UPDATE_NOTICE_SECONDS ? record : null
}
