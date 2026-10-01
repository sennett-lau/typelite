import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { activeAiPreset, activeSpeechPreset, endpointState } from '../../lib/connectionStatus'
import { isAiReady, isSpeechReady } from '../../lib/readiness'
import { settingsPaneHash } from '../../lib/router'
import { cancelSpeechSetup } from '../../lib/tauri'
import { isSetupRunning } from '../../stores/speechSetupStore'
import { Group, Row } from '../ui/Group'
import { ProgressTrack } from '../Speech/BuiltinParts'
import {
  failedBadge,
  failedReason,
  runningBadge,
  runningEta,
  runningSize,
  setupFailed,
} from '../Speech/builtinText'
import { beginSpeechSetup, useSpeechSetupStatus } from '../../hooks/useSpeechSetup'

/**
 * "Finish setup" (plan `setup-without-dead-ends`): one row per service that is not ready yet, with
 * what it means for the shortcuts. Hidden when both work.
 *
 * "Set up" opens the service's Settings pane (Speech or AI), where the user picks Built-in or their
 * own server; nothing downloads from Home. A Built-in speech setup started there still shows its
 * progress (and Retry after a failure) under the row until it is done.
 */
export function FinishSetup() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const speechHealth = useAppStore((s) => s.speechHealth)
  const aiHealth = useAppStore((s) => s.aiHealth)
  const setupStatus = useSpeechSetupStatus()

  const rows: { id: 'speech' | 'ai'; pane: 'stt' | 'llm'; failed: boolean }[] = []
  if (!isSpeechReady(config)) {
    const failed = endpointState(speechHealth, activeSpeechPreset(config).id) === 'error'
    rows.push({ id: 'speech', pane: 'stt', failed })
  }
  if (!isAiReady(config)) {
    const failed = endpointState(aiHealth, activeAiPreset(config).id) === 'error'
    rows.push({ id: 'ai', pane: 'llm', failed })
  }
  if (rows.length === 0) return null

  const openPane = (pane: 'stt' | 'llm') => {
    window.location.hash = settingsPaneHash(pane)
  }
  const running = isSetupRunning(setupStatus)
  const failed = setupFailed(setupStatus)

  return (
    <div className="mb-[22px]">
      <Group label={t('home.setup.title')}>
        {rows.map((row) => (
          <Fragment key={row.id}>
            <Row
              testId={`finish-setup-${row.id}`}
              label={t(`home.setup.${row.id}`)}
              help={
                <>
                  <span className={row.failed ? 'text-error' : 'text-warning'}>
                    {row.failed ? t('home.setup.failed') : t('home.setup.notReady')}
                  </span>
                  {' · '}
                  {t(`home.setup.${row.id}Impact`)}
                </>
              }
            >
              <button
                type="button"
                onClick={() => openPane(row.pane)}
                aria-label={`${t('home.setup.setUp')}: ${t(`home.setup.${row.id}`)}`}
                className="btn-accent"
              >
                {t('home.setup.setUp')}
              </button>
            </Row>
            {row.id === 'speech' && running && (
              <Row>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="status-line">
                    <span className="badge badge-neutral">{runningBadge(setupStatus, t)}</span>
                    <span className="status-detail">{runningSize(setupStatus, t)}</span>
                  </span>
                  <ProgressTrack status={setupStatus} />
                  <span className="status-detail">{runningEta(setupStatus, t)}</span>
                </div>
                {setupStatus.phase === 'downloading' && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelSpeechSetup().catch((error) =>
                        console.error('[speech setup] cancel failed', error),
                      )
                    }}
                    className="btn-secondary"
                  >
                    {t('speechSetup.cancel')}
                  </button>
                )}
              </Row>
            )}
            {row.id === 'speech' && failed && (
              <Row>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="status-line">
                    <span className="badge badge-error">{failedBadge(setupStatus, t)}</span>
                  </span>
                  <span className="status-detail">{failedReason(setupStatus, t)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => beginSpeechSetup(setupStatus.modelId ?? undefined)}
                  className="btn-accent"
                >
                  {t('speechSetup.retry')}
                </button>
              </Row>
            )}
          </Fragment>
        ))}
      </Group>
    </div>
  )
}
