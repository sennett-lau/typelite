import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Check, Keyboard, Loader2, Mic, Workflow } from 'lucide-react'
import { openPrivacySettings } from '../../lib/tauri'
import type { PermissionStatus } from '../../lib/tauri'
import { PERMISSION_IDS } from './usePermissions'
import type { PermissionId, PermissionsState } from './usePermissions'

const ICONS: Record<PermissionId, React.ComponentType<{ size?: number }>> = {
  microphone: Mic,
  accessibility: Keyboard,
  automation: Workflow,
}

interface Props {
  permissions: PermissionsState
  /** Continue without all permissions ("Skip for now"). */
  onSkip: () => void
}

/**
 * Step 1: welcome, plus one row per macOS permission with its own Grant button and a live
 * status. Next unlocks when all three are granted; "Skip for now" continues anyway.
 */
export function WelcomeStep({ permissions, onSkip }: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <p className="text-center text-[13px] leading-relaxed text-text-secondary">
        {t('onboarding.welcome.intro')}
      </p>
      <div className="row-group">
        {PERMISSION_IDS.map((id) => (
          <PermissionRow
            key={id}
            id={id}
            status={permissions.statuses[id]}
            error={permissions.errors[id]}
            busy={permissions.busy[id]}
            onGrant={() => permissions.grant(id)}
          />
        ))}
      </div>
      {!permissions.allGranted && (
        <div className="text-center">
          <button
            type="button"
            onClick={onSkip}
            className="border-none bg-transparent text-[12px] text-text-tertiary underline-offset-2 hover:text-text-primary hover:underline cursor-pointer"
          >
            {t('onboarding.welcome.skipForNow')}
          </button>
        </div>
      )}
    </div>
  )
}

function PermissionRow({
  id,
  status,
  error,
  busy,
  onGrant,
}: {
  id: PermissionId
  status: PermissionStatus | null
  error: string | null
  busy: boolean
  onGrant: () => void
}) {
  const { t } = useTranslation()
  // Accessibility is granted in System Settings, not in a dialog; after one try, offer the
  // shortcut to that page. A denied permission can only be turned on there as well.
  const [triedGrant, setTriedGrant] = useState(false)
  const Icon = ICONS[id]
  const granted = status === 'granted'
  const needsSettings = status === 'denied' || (id === 'accessibility' && triedGrant)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const handleGrant = () => {
    setTriedGrant(true)
    onGrant()
  }
  const handleOpenSettings = () => {
    setSettingsError(null)
    openPrivacySettings(id).catch((openError) => setSettingsError(String(openError)))
  }

  return (
    <div data-testid={`permission-${id}`} data-status={status ?? 'checking'} className="row block">
      <div className="flex items-center gap-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-accent-light text-accent">
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-primary">{t(`onboarding.permissions.${id}`)}</p>
          <p className="row-help">{t(`onboarding.permissions.${id}Desc`)}</p>
        </div>
        {granted ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
            <Check size={10} />
            {t('onboarding.permissions.status.granted')}
          </span>
        ) : status === null ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-text-tertiary" />
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {status === 'denied' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning">
                <AlertCircle size={10} />
                {t('onboarding.permissions.status.denied')}
              </span>
            )}
            {needsSettings ? (
              <button type="button" onClick={handleOpenSettings} className="btn-secondary">
                {t('onboarding.permissions.openSettings')}
              </button>
            ) : null}
            {status !== 'denied' && (
              <button
                type="button"
                onClick={handleGrant}
                disabled={busy}
                aria-label={`${t('onboarding.permissions.grant')} ${t(`onboarding.permissions.${id}`)}`}
                className="btn-accent"
              >
                {busy && <Loader2 size={11} className="animate-spin" />}
                {error ? t('onboarding.permissions.retry') : t('onboarding.permissions.grant')}
              </button>
            )}
          </div>
        )}
      </div>
      {(error || settingsError) && !granted && (
        <p className="mt-1.5 text-[11px] text-error">{error ?? settingsError}</p>
      )}
    </div>
  )
}
