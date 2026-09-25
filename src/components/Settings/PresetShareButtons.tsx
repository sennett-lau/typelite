import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Upload } from 'lucide-react'
import {
  applyImportedPresets,
  applyPresetImport,
  cancelPresetImport,
  exportPresets,
  listExportablePresets,
  pickPresetImport,
  shareErrorMessage,
  type ExportCandidate,
  type ImportPreview,
  type ShareService,
} from '../../lib/presetShare'
import { useAppStore } from '../../stores/appStore'
import { PresetShareExportDialog } from './PresetShareExportDialog'
import { PresetShareImportDialog } from './PresetShareImportDialog'

type Open =
  | { kind: 'none' }
  | { kind: 'export'; candidates: ExportCandidate[] }
  | { kind: 'import'; preview: ImportPreview }

/** True when Settings has unsaved edits to this page's presets. */
function hasUnsavedPresets(service: ShareService): boolean {
  const { config, savedConfig } = useAppStore.getState()
  if (!savedConfig) return false
  const key = service === 'speech' ? 'speech_presets' : 'ai_presets'
  return JSON.stringify(config[key]) !== JSON.stringify(savedConfig[key])
}

/**
 * Plan 0019: "Import…" and "Export…" for the saved presets of one Settings page. The backend
 * shows the system open and save dialogs; these buttons show what is in a file (Import) or what
 * goes into it (Export) and report the result.
 */
export function PresetShareButtons({ service }: { service: ShareService }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Open>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null)
  const fileType = t('presetShare.fileType')

  const close = () => {
    if (open.kind === 'import') void cancelPresetImport().catch(() => undefined)
    setOpen({ kind: 'none' })
    setDialogError(null)
  }

  const startExport = async () => {
    setStatus(null)
    setBusy(true)
    try {
      setOpen({ kind: 'export', candidates: await listExportablePresets(service) })
    } catch (error) {
      setStatus({ text: shareErrorMessage(t, error), error: true })
    } finally {
      setBusy(false)
    }
  }

  const runExport = async (ids: string[], includeKeys: boolean) => {
    setDialogError(null)
    setBusy(true)
    try {
      const result = await exportPresets(service, ids, includeKeys, fileType)
      if (result) {
        setOpen({ kind: 'none' })
        setStatus({
          text: t('presetShare.exported', { count: result.count, file: result.fileName }),
          error: false,
        })
      }
    } catch (error) {
      setDialogError(shareErrorMessage(t, error))
    } finally {
      setBusy(false)
    }
  }

  const startImport = async () => {
    setStatus(null)
    setBusy(true)
    try {
      const preview = await pickPresetImport(service, fileType)
      if (preview) setOpen({ kind: 'import', preview })
    } catch (error) {
      setStatus({ text: shareErrorMessage(t, error), error: true })
    } finally {
      setBusy(false)
    }
  }

  const runImport = async (indices: number[]) => {
    setDialogError(null)
    setBusy(true)
    try {
      const result = await applyPresetImport(service, indices)
      applyImportedPresets(result)
      setOpen({ kind: 'none' })
      const count = result.speech.length + result.ai.length
      const text = t('presetShare.imported', { count })
      setStatus({
        text: result.keysFailed
          ? `${text} ${t('presetShare.keysFailed', { count: result.keysFailed })}`
          : text,
        error: false,
      })
    } catch (error) {
      // The backend dropped the file; the user picks it again.
      setOpen({ kind: 'none' })
      setStatus({ text: shareErrorMessage(t, error), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-1 mt-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void startImport()}
          disabled={busy}
          className="link-button inline-flex items-center gap-1"
        >
          <Download size={12} aria-hidden="true" />
          {t('presetShare.import')}
        </button>
        <button
          type="button"
          onClick={() => void startExport()}
          disabled={busy}
          className="link-button inline-flex items-center gap-1"
        >
          <Upload size={12} aria-hidden="true" />
          {t('presetShare.export')}
        </button>
      </div>
      {status && (
        <p
          role="status"
          className={`m-0 mt-1 text-right text-[12px] ${status.error ? 'text-error' : 'text-text-secondary'}`}
        >
          {status.text}
        </p>
      )}
      {open.kind === 'export' && (
        <PresetShareExportDialog
          candidates={open.candidates}
          busy={busy}
          error={dialogError}
          unsavedChanges={hasUnsavedPresets(service)}
          onCancel={close}
          onExport={(ids, includeKeys) => void runExport(ids, includeKeys)}
        />
      )}
      {open.kind === 'import' && (
        <PresetShareImportDialog
          service={service}
          preview={open.preview}
          busy={busy}
          error={dialogError}
          onCancel={close}
          onConfirm={(indices) => void runImport(indices)}
        />
      )}
    </div>
  )
}
