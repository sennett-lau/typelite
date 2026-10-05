import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import {
  checkForUpdate,
  clearRunTimings,
  installUpdate,
  resetSpeedStats,
  restartToUpdate,
} from '../../lib/tauri'
import { downloadPercent, useUpdateStatus } from '../../lib/updates'
import { APP_VERSION } from '../../lib/constants'
import { Group, Row } from '../ui/Group'
import { Toggle } from './shared/Toggle'

/**
 * Plan `speed-by-preset`: deletes the run timings behind Home's Insights (durations, sizes and
 * preset ids only; there is never any dictated text in them).
 */
function ClearInsightsRow() {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'busy' | 'cleared' | 'failed'>('idle')

  const clear = () => {
    setState('busy')
    clearRunTimings()
      .then(() => setState('cleared'))
      .catch((error) => {
        console.error('[settings] failed to clear insights data', error)
        setState('failed')
      })
  }

  return (
    <Row label={t('settings.clearInsights')} help={t('settings.clearInsightsHint')}>
      {state === 'cleared' && (
        <span className="text-[12px] text-text-secondary" role="status">
          {t('settings.insightsCleared')}
        </span>
      )}
      {state === 'failed' && (
        <span className="text-[12px] text-error" role="status">
          {t('settings.clearInsightsFailed')}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={clear} disabled={state === 'busy'}>
        {t('settings.clearInsightsButton')}
      </button>
    </Row>
  )
}

/**
 * Plan `typing-speed-and-nudge`: clears the speaking and typing totals behind the speed row at the
 * top of Insights (counts and minutes only).
 */
function ResetSpeedStatsRow() {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle')

  const reset = () => {
    setState('busy')
    resetSpeedStats()
      .then(() => setState('done'))
      .catch((error) => {
        console.error('[settings] failed to reset speed stats', error)
        setState('failed')
      })
  }

  return (
    <Row label={t('settings.resetSpeedStats')} help={t('settings.resetSpeedStatsHint')}>
      {state === 'done' && (
        <span className="text-[12px] text-text-secondary" role="status">
          {t('settings.speedStatsReset')}
        </span>
      )}
      {state === 'failed' && (
        <span className="text-[12px] text-error" role="status">
          {t('settings.resetSpeedStatsFailed')}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={reset} disabled={state === 'busy'}>
        {t('settings.resetSpeedStatsButton')}
      </button>
    </Row>
  )
}

/**
 * Plan `auto-update`: this version, Check for updates, and what the last check found (with
 * Update or Restart to update when a new version is waiting).
 */
function UpdateCheckRow() {
  const { t } = useTranslation()
  const [status, setStatus] = useUpdateStatus()

  const run = (action: () => Promise<typeof status>) => {
    action()
      .then((next) => {
        if (next) setStatus(next)
      })
      .catch((error) => setStatus({ state: 'failed', message: String(error) }))
  }
  const busy = status.state === 'checking' || status.state === 'downloading'
  const percent = downloadPercent(status)

  let line: string | null = null
  if (status.state === 'checking') line = t('updates.checking')
  if (status.state === 'upToDate') line = t('updates.upToDate')
  if (status.state === 'available') line = t('updates.availableTitle', { version: status.version })
  if (status.state === 'downloading')
    line =
      percent === null
        ? t('updates.downloadingTitle', { version: status.version })
        : `${t('updates.downloadingTitle', { version: status.version })} ${t('updates.downloadingPercent', { percent })}`
  if (status.state === 'ready') line = t('updates.readyTitle', { version: status.version })
  if (status.state === 'failed') line = t('updates.failed', { message: status.message })
  if (status.state === 'disabled') line = t('updates.disabled')

  return (
    <Row
      label={t('updates.version', { version: APP_VERSION })}
      help={line ?? undefined}
      testId="update-check-row"
    >
      {status.state === 'available' && (
        <button type="button" className="btn-accent" onClick={() => run(installUpdate)}>
          {t('updates.update')}
        </button>
      )}
      {status.state === 'ready' && (
        <button
          type="button"
          className="btn-accent"
          onClick={() => {
            restartToUpdate().catch(() => {})
          }}
        >
          {t('updates.restart')}
        </button>
      )}
      {status.state !== 'ready' && status.state !== 'available' && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => run(checkForUpdate)}
          disabled={busy || status.state === 'disabled'}
        >
          {t('updates.check')}
        </button>
      )}
    </Row>
  )
}

/**
 * Settings → System: how Typelite sits in macOS. "Launch at login" is applied through the
 * autostart plugin when the settings are saved; "Show in Dock" switches the macOS activation
 * policy (see `apply_dock_visibility` in `src-tauri/src/lib.rs`).
 */
export function SystemPane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const { t } = useTranslation()

  return (
    <div>
      <Group label={t('settings.systemApp')}>
        <Row label={t('settings.launchAtStartup')}>
          <Toggle
            checked={config.auto_start}
            onChange={(checked) => updateConfig({ auto_start: checked })}
            label={t('settings.launchAtStartup')}
            hideLabel
          />
        </Row>
        <Row label={t('settings.showInDock')} help={t('settings.showInDockHint')}>
          <Toggle
            checked={config.show_in_dock}
            onChange={(checked) => updateConfig({ show_in_dock: checked })}
            label={t('settings.showInDock')}
            hideLabel
          />
        </Row>
      </Group>
      {/* Plan `auto-update`. */}
      <Group label={t('updates.group')}>
        <Row label={t('updates.auto')} help={t('updates.autoHint')}>
          <Toggle
            checked={config.auto_update ?? true}
            onChange={(checked) => updateConfig({ auto_update: checked })}
            label={t('updates.auto')}
            hideLabel
          />
        </Row>
        <UpdateCheckRow />
      </Group>
      <Group label={t('settings.systemInsights')}>
        {/* Plan `typing-speed-and-nudge`: typing speed for the speed row at the top of Insights. */}
        <Row label={t('settings.measureTypingSpeed')} help={t('settings.measureTypingSpeedHint')}>
          <Toggle
            checked={config.measure_typing_speed}
            onChange={(checked) => updateConfig({ measure_typing_speed: checked })}
            label={t('settings.measureTypingSpeed')}
            hideLabel
          />
        </Row>
        <ResetSpeedStatsRow />
        <ClearInsightsRow />
      </Group>
    </div>
  )
}
