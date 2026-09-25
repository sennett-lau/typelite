import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { toggled, type ExportCandidate } from '../../lib/presetShare'
import { PresetChecklist, PresetShareDialog } from './PresetShareDialog'

interface Props {
  candidates: ExportCandidate[]
  busy: boolean
  error: string | null
  /** Settings has unsaved edits; only saved presets are exported. */
  unsavedChanges: boolean
  onCancel: () => void
  onExport: (ids: string[], includeKeys: boolean) => void
}

/**
 * Plan `preset-sharing`: choose which saved presets go into the file (all by default) and whether their API
 * keys go with them (off by default, with a warning when on).
 */
export function PresetShareExportDialog({
  candidates,
  busy,
  error,
  unsavedChanges,
  onCancel,
  onExport,
}: Props) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(() => new Set(candidates.map((c) => c.id)))
  const [includeKeys, setIncludeKeys] = useState(false)
  const chosen = candidates.filter((candidate) => checked.has(candidate.id))

  return (
    <PresetShareDialog
      title={t('presetShare.exportTitle')}
      busy={busy}
      onCancel={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() =>
              onExport(
                chosen.map((c) => c.id),
                includeKeys,
              )
            }
            disabled={busy || chosen.length === 0}
            className="btn-accent"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {t('presetShare.exportConfirm')}
          </button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="m-0 text-[12.5px] text-text-secondary">{t('presetShare.exportNone')}</p>
      ) : (
        <>
          <p className="m-0 mb-2 text-[12px] text-text-secondary">{t('presetShare.exportHelp')}</p>
          <PresetChecklist
            label={t('presetShare.exportListLabel')}
            items={candidates.map((candidate) => ({
              key: candidate.id,
              name: candidate.name,
              detail: candidate.host,
            }))}
            checked={checked}
            disabled={busy}
            onToggle={(id) => setChecked((set) => toggled(set, id))}
          />
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[12.5px] text-text-primary">
            <input
              type="checkbox"
              checked={includeKeys}
              disabled={busy}
              onChange={(event) => setIncludeKeys(event.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            {t('presetShare.includeKeys')}
          </label>
          {includeKeys && (
            <p role="alert" className="m-0 mt-1.5 text-[12px] text-warning">
              {t('presetShare.includeKeysWarning')}
            </p>
          )}
          {unsavedChanges && (
            <p className="m-0 mt-2 text-[12px] text-text-secondary">
              {t('presetShare.unsavedNote')}
            </p>
          )}
        </>
      )}
      {error && <p className="m-0 mt-2 text-[12px] text-error">{error}</p>}
    </PresetShareDialog>
  )
}
