import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listen } from '@tauri-apps/api/event'
import { useAppStore } from '../../stores/appStore'
import type { HandsFreeConfig } from '../../stores/appStore'
import {
  HANDS_FREE_SETUP_EVENT,
  cancelHandsFreeModelDownload,
  downloadHandsFreeModel,
  getHandsFreeStatus,
} from '../../lib/tauri'
import type { HandsFreeStatus, SpeechSetupStatus } from '../../lib/tauri'
import { Group, Row } from '../ui/Group'
import { SegmentedControl } from './shared/SegmentedControl'
import { Toggle } from './shared/Toggle'

const DEFAULT_HANDS_FREE: HandsFreeConfig = {
  enabled: false,
  wake_name: 'Sam',
  sensitivity: 'normal',
}

/** Plan `hands-free-mode` (settings.md): the switch, wake name and sensitivity. */
export function HandsFreeSettings() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const handsFree = config.hands_free ?? DEFAULT_HANDS_FREE
  const [status, setStatus] = useState<HandsFreeStatus | null>(null)
  const [setup, setSetup] = useState<SpeechSetupStatus | null>(null)

  const refresh = useCallback(() => {
    getHandsFreeStatus()
      .then((next) => {
        setStatus(next)
        setSetup(next.setup)
      })
      .catch((err) => console.error('Failed to load hands-free status:', err))
  }, [])

  // The backend applies a saved change a moment later; ask again then.
  useEffect(() => {
    refresh()
    const timer = window.setTimeout(refresh, 800)
    return () => window.clearTimeout(timer)
  }, [refresh, handsFree.enabled, handsFree.wake_name, handsFree.sensitivity])

  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | null = null
    listen<SpeechSetupStatus>(HANDS_FREE_SETUP_EVENT, (event) => {
      setSetup(event.payload)
      if (event.payload.phase === 'ready' || event.payload.phase === 'error') refresh()
    })
      .then((fn) => {
        if (disposed) fn()
        else unlisten = fn
      })
      .catch((err) => console.error('Failed to listen for hands-free setup:', err))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [refresh])

  const update = (partial: Partial<HandsFreeConfig>) =>
    updateConfig({ hands_free: { ...handsFree, ...partial } })

  const name = handsFree.wake_name.trim() || 'Sam'
  const downloading =
    setup?.phase === 'downloading' || setup?.phase === 'verifying' || setup?.phase === 'testing'
  const percent =
    setup && setup.totalBytes > 0
      ? Math.min(100, Math.round((setup.downloadedBytes / setup.totalBytes) * 100))
      : 0
  const sizeMb = Math.round((status?.modelSizeBytes ?? 59_707_625) / 1_000_000)

  let note: { text: string; tone: 'muted' | 'error' } | null = null
  if (handsFree.enabled) {
    if (downloading) {
      note = { text: t('settings.handsFree.downloading', { percent }), tone: 'muted' }
    } else if (setup?.phase === 'error' && setup.error?.code !== 'cancelled') {
      note = { text: t('settings.handsFree.downloadFailed'), tone: 'error' }
    } else if (status && !status.modelInstalled) {
      note = { text: t('settings.handsFree.needsModel', { size: sizeMb }), tone: 'muted' }
    } else if (status?.listener === 'listening') {
      note = { text: t('settings.handsFree.listening', { name }), tone: 'muted' }
    } else if (status?.listener === 'micError') {
      note = { text: t('settings.handsFree.micError'), tone: 'error' }
    }
  }

  return (
    <Group label={t('settings.handsFree.title')}>
      <Row
        label={t('settings.handsFree.enable')}
        help={t('settings.handsFree.enableHelp', { name })}
      >
        <Toggle
          checked={handsFree.enabled}
          onChange={(checked) => update({ enabled: checked })}
          label={t('settings.handsFree.enable')}
          hideLabel
        />
      </Row>
      {handsFree.enabled && (
        <>
          {note && (
            <Row testId="hands-free-status">
              <div className="flex items-center gap-3 text-[12px]">
                <p className={note.tone === 'error' ? 'text-error' : 'text-text-secondary'}>
                  {note.text}
                </p>
                {status && !status.modelInstalled && !downloading && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      downloadHandsFreeModel().catch((err) =>
                        console.error('Failed to download the wake model:', err),
                      )
                    }}
                  >
                    {t('settings.handsFree.download')}
                  </button>
                )}
                {downloading && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      cancelHandsFreeModelDownload().catch(() => undefined)
                    }}
                  >
                    {t('settings.handsFree.cancel')}
                  </button>
                )}
              </div>
            </Row>
          )}
          <Row
            label={t('settings.handsFree.wakeName')}
            help={t('settings.handsFree.wakeNameHelp')}
            htmlFor="hands-free-wake-name"
          >
            <input
              id="hands-free-wake-name"
              value={handsFree.wake_name}
              maxLength={32}
              onChange={(event) => update({ wake_name: event.target.value })}
              className="field w-40"
            />
          </Row>
          <Row
            label={t('settings.handsFree.sensitivity')}
            help={t('settings.handsFree.sensitivityHelp')}
          >
            <SegmentedControl
              ariaLabel={t('settings.handsFree.sensitivity')}
              options={[
                { value: 'low', label: t('settings.handsFree.low') },
                { value: 'normal', label: t('settings.handsFree.normal') },
                { value: 'high', label: t('settings.handsFree.high') },
              ]}
              value={handsFree.sensitivity}
              onChange={(v) => update({ sensitivity: v as HandsFreeConfig['sensitivity'] })}
            />
          </Row>
          <Row>
            <p className="text-[12px] text-text-secondary">
              {t('settings.handsFree.requests', { name })}
            </p>
          </Row>
        </>
      )}
    </Group>
  )
}
