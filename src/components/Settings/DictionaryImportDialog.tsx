import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { DictionaryImportReport } from '../../lib/tauri'

interface DictionaryImportDialogProps {
  fileName: string
  report: DictionaryImportReport
  committing: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function DictionaryImportDialog({
  fileName,
  report,
  committing,
  onCancel,
  onConfirm,
}: DictionaryImportDialogProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || committing) return
      event.preventDefault()
      onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [committing, onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5">
      <div className="fixed inset-0" onClick={committing ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('dictionary.importTitle')}
        className="relative z-10 w-full max-w-[420px] dialog"
      >
        <div className="border-b border-hairline px-4 py-3">
          <h3 className="text-[14px] font-medium text-text-primary">
            {t('dictionary.importTitle')}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{fileName}</p>
        </div>
        <div className="grid grid-cols-3 gap-3 px-4 py-3 text-center">
          <div>
            <p className="text-[16px] font-semibold text-text-primary">{report.accepted}</p>
            <p className="text-[11px] text-text-tertiary">{t('dictionary.importAccepted')}</p>
          </div>
          <div>
            <p className="text-[16px] font-semibold text-text-primary">
              {report.skippedDuplicates}
            </p>
            <p className="text-[11px] text-text-tertiary">{t('dictionary.importDuplicates')}</p>
          </div>
          <div>
            <p className="text-[16px] font-semibold text-text-primary">{report.skippedInvalid}</p>
            <p className="text-[11px] text-text-tertiary">{t('dictionary.importInvalid')}</p>
          </div>
        </div>
        {report.errors.length > 0 && (
          <div className="mx-4 max-h-28 overflow-y-auto border-y border-hairline py-1.5">
            {report.errors.slice(0, 20).map((error) => (
              <p
                key={`${error.row}-${error.code}`}
                className="py-0.5 text-[11px] text-text-secondary"
              >
                {t('dictionary.importRowError', { row: error.row, code: error.code })}
              </p>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 px-4 py-3">
          <button type="button" onClick={onCancel} disabled={committing} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            disabled={report.accepted === 0 || committing}
            className="btn-accent"
          >
            {t('dictionary.confirmImport')}
          </button>
        </div>
      </div>
    </div>
  )
}
