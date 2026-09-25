import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { toggled, type ImportPreview, type ShareService } from '../../lib/presetShare'
import { PresetChecklist, PresetShareDialog } from './PresetShareDialog'

interface Props {
  service: ShareService
  preview: ImportPreview
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (indices: number[]) => void
}

/**
 * Plan `preset-sharing`: what a presets file holds for this page (name and host of each preset), with a
 * checkbox each (all ticked). Only the ticked ones are added; nothing is replaced or selected.
 */
export function PresetShareImportDialog({
  service,
  preview,
  busy,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(
    () => new Set(preview.entries.map((entry) => String(entry.index))),
  )
  const chosen = preview.entries.filter((entry) => checked.has(String(entry.index)))
  const otherPage = t(service === 'speech' ? 'presetShare.pageAi' : 'presetShare.pageSpeech')

  return (
    <PresetShareDialog
      title={t('presetShare.importTitle')}
      subtitle={preview.fileName}
      busy={busy}
      onCancel={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
            {t('common.cancel')}
          </button>
          {preview.entries.length > 0 && (
            <button
              type="button"
              onClick={() => onConfirm(chosen.map((entry) => entry.index))}
              disabled={busy || chosen.length === 0}
              className="btn-accent"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {t('presetShare.importConfirm', { count: chosen.length })}
            </button>
          )}
        </>
      }
    >
      {preview.entries.length === 0 ? (
        <p className="m-0 text-[12.5px] text-text-secondary">{t('presetShare.importNone')}</p>
      ) : (
        <>
          <p className="m-0 mb-2 text-[12px] text-text-secondary">{t('presetShare.importHelp')}</p>
          <PresetChecklist
            label={t('presetShare.importListLabel')}
            items={preview.entries.map((entry) => ({
              key: String(entry.index),
              name: entry.name,
              detail: entry.model ? `${entry.host} · ${entry.model}` : entry.host,
              tag: entry.hasKey ? t('presetShare.keyIncluded') : undefined,
            }))}
            checked={checked}
            disabled={busy}
            onToggle={(key) => setChecked((set) => toggled(set, key))}
          />
        </>
      )}
      {preview.skippedUnknown > 0 && (
        <p className="m-0 mt-2 text-[12px] text-text-secondary">
          {t('presetShare.skippedUnknown', { count: preview.skippedUnknown })}
        </p>
      )}
      {preview.otherServiceCount > 0 && (
        <p className="m-0 mt-2 text-[12px] text-text-secondary">
          {t('presetShare.otherService', { count: preview.otherServiceCount, page: otherPage })}
        </p>
      )}
      {error && <p className="m-0 mt-2 text-[12px] text-error">{error}</p>}
    </PresetShareDialog>
  )
}
