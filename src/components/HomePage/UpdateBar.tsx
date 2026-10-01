import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RotateCw } from 'lucide-react'
import { installUpdate, restartToUpdate } from '../../lib/tauri'
import { downloadPercent, useUpdateStatus } from '../../lib/updates'

/**
 * Plan `auto-update`: a bar at the top of Home when a new version is waiting. Available (with
 * automatic updates off) → Update; downloading → progress; ready → Restart to update. Hidden
 * otherwise.
 */
export function UpdateBar() {
  const { t } = useTranslation()
  const [status, setStatus] = useUpdateStatus()
  const [failed, setFailed] = useState<string | null>(null)

  if (status.state === 'failed' && failed) {
    return (
      <div className="update-bar" role="status" data-testid="update-bar" data-state="failed">
        <span className="min-w-0 flex-1 text-error">
          {t('updates.failed', { message: failed })}
        </span>
      </div>
    )
  }
  if (status.state !== 'available' && status.state !== 'downloading' && status.state !== 'ready') {
    return null
  }

  const update = () => {
    setFailed(null)
    installUpdate()
      .then((next) => {
        if (!next) return
        setStatus(next)
        if (next.state === 'failed') setFailed(next.message)
      })
      .catch((error) => setFailed(String(error)))
  }

  const percent = downloadPercent(status)
  return (
    <div className="update-bar" role="status" data-testid="update-bar" data-state={status.state}>
      <span className="update-bar-icon" aria-hidden="true">
        {status.state === 'ready' ? <RotateCw size={14} /> : <Download size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        {status.state === 'available' && (
          <>
            <b>{t('updates.availableTitle', { version: status.version })}</b>{' '}
            <span className="text-text-secondary">{t('updates.availableBody')}</span>
          </>
        )}
        {status.state === 'downloading' && (
          <>
            <b>{t('updates.downloadingTitle', { version: status.version })}</b>{' '}
            <span className="text-text-secondary">
              {percent === null
                ? t('updates.downloading')
                : t('updates.downloadingPercent', { percent })}
            </span>
          </>
        )}
        {status.state === 'ready' && (
          <>
            <b>{t('updates.readyTitle', { version: status.version })}</b>{' '}
            <span className="text-text-secondary">{t('updates.readyBody')}</span>
          </>
        )}
      </span>
      {status.state === 'available' && (
        <button type="button" className="btn-accent" onClick={update}>
          {t('updates.update')}
        </button>
      )}
      {status.state === 'ready' && (
        <button
          type="button"
          className="btn-accent"
          onClick={() => {
            restartToUpdate().catch((error) => setFailed(String(error)))
          }}
        >
          {t('updates.restart')}
        </button>
      )}
    </div>
  )
}
