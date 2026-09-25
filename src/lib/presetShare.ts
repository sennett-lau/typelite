import { invoke } from '@tauri-apps/api/core'
import type { AiPreset, AppConfig, SpeechPreset } from '../stores/appStore'
import { useAppStore } from '../stores/appStore'

/**
 * Plan `preset-sharing`: export and import presets as a `*.typelite-presets.json` file. The backend shows
 * the system save and open dialogs and reads and writes the file (see
 * `src-tauri/src/commands/preset_share.rs`), so file paths and API keys stay out of the web view.
 */

/** Which Settings page the buttons are on; each exports and imports its own presets. */
export type ShareService = 'speech' | 'ai'

export interface ExportCandidate {
  id: string
  name: string
  host: string
}

export interface ExportResult {
  fileName: string
  count: number
}

export interface ImportEntry {
  /** Position in the file's list for this page; sent back to choose entries. */
  index: number
  name: string
  host: string
  model: string
  hasKey: boolean
}

export interface ImportPreview {
  fileName: string
  entries: ImportEntry[]
  /** Entries of kinds this version cannot import (skipped). */
  skippedUnknown: number
  /** Entries for the other Settings page. */
  otherServiceCount: number
}

export interface ImportResult {
  speech: SpeechPreset[]
  ai: AiPreset[]
  keysFailed: number
}

/** The error object the share commands reject with. */
export interface ShareError {
  code: string
  version?: number
  name?: string
  address?: string
  details?: string
  list?: string
  index?: number
}

export function listExportablePresets(service: ShareService): Promise<ExportCandidate[]> {
  return invoke('list_exportable_presets', { service })
}

/** Shows the save dialog and writes the file. `null` when the user cancelled. */
export function exportPresets(
  service: ShareService,
  ids: string[],
  includeKeys: boolean,
  filterName: string,
): Promise<ExportResult | null> {
  return invoke('export_presets', { service, ids, includeKeys, filterName })
}

/** Shows the open dialog, reads and checks the file. `null` when the user cancelled. */
export function pickPresetImport(
  service: ShareService,
  filterName: string,
): Promise<ImportPreview | null> {
  return invoke('pick_preset_import', { service, filterName })
}

/** Adds the chosen entries of the file read by `pickPresetImport`. */
export function applyPresetImport(service: ShareService, indices: number[]): Promise<ImportResult> {
  return invoke('apply_preset_import', { service, indices })
}

export function cancelPresetImport(): Promise<void> {
  return invoke('cancel_preset_import')
}

/** `config` with the imported presets added at the end of their lists. */
export function withImportedPresets(config: AppConfig, result: ImportResult): AppConfig {
  return {
    ...config,
    speech_presets: [...config.speech_presets, ...result.speech],
    ai_presets: [...config.ai_presets, ...result.ai],
  }
}

/**
 * The backend saved the imported presets, so add them to both the edited and the saved config.
 * Other unsaved edits stay unsaved, and the preset in use does not change.
 */
export function applyImportedPresets(result: ImportResult): void {
  useAppStore.setState((state) => ({
    config: withImportedPresets(state.config, result),
    savedConfig: state.savedConfig
      ? withImportedPresets(state.savedConfig, result)
      : state.savedConfig,
  }))
}

const KNOWN_ERROR_CODES = new Set([
  'not_json',
  'wrong_format',
  'newer_version',
  'invalid_version',
  'too_large',
  'too_many_entries',
  'invalid_entry',
  'bad_address',
  'nothing_selected',
  'no_pending_import',
  'read_failed',
  'write_failed',
  'key_read_failed',
  'save_failed',
  'not_allowed',
])

/** A translated message for a rejected share command. */
export function shareErrorMessage(
  t: (key: string, values?: Record<string, unknown>) => string,
  error: unknown,
): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const shareError = error as ShareError
    if (KNOWN_ERROR_CODES.has(shareError.code)) {
      return t(`presetShare.errors.${shareError.code}`, {
        version: shareError.version ?? '',
        name: shareError.name ?? '',
        address: shareError.address ?? '',
        details: shareError.details ?? '',
        entry: (shareError.index ?? 0) + 1,
      })
    }
  }
  return t('presetShare.errors.unknown', {
    details: error instanceof Error ? error.message : String(error),
  })
}

/** Adds `key` to the set when missing, removes it when present (checkbox lists). */
export function toggled(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
