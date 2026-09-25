import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { activeAiPreset, activeSpeechPreset, endpointState } from '../../lib/connectionStatus'
import { isAiReady, isSpeechReady } from '../../lib/readiness'
import { settingsPaneHash } from '../../lib/router'
import { cancelSpeechSetup } from '../../lib/tauri'
import { DEFAULT_SETUP_MODEL, defaultModelChoice } from '../../lib/speechSetup'
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
import {
  beginSpeechSetup,
  useSpeechHardware,
  useSpeechSetupStatus,
} from '../../hooks/useSpeechSetup'

/**
 * "Finish setup" (plan 0007): one row per service that is not ready yet, with what it means
 * for the shortcuts. Hidden when both work.
 *
 * Speech (plans 0012 and 0015): "Set up" starts the Built-in setup right here with the model
 * this Mac is offered first; the progress shows under the row until it is done. "Other
 * options" opens Settings → Speech. AI: "Set up" opens Settings → AI.
 */
export function FinishSetup() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const speechHealth = useAppStore((s) => s.speechHealth)
  const aiHealth = useAppStore((s) => s.aiHealth)
  const setupStatus = useSpeechSetupStatus()
  const hardware = useSpeechHardware()

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
  // No model fits on this Mac's disk: Settings says how much space is needed.
  const noModelFits = hardware !== null && hardware.offer.models.length === 0
  const setUpSpeech = () => {
    if (noModelFits) openPane('stt')
    else beginSpeechSetup(defaultModelChoice(hardware) ?? DEFAULT_SETUP_MODEL)
  }

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
              {row.id === 'speech' && (
                <button
                  type="button"
                  onClick={() => openPane('stt')}
                  className="cursor-pointer border-none bg-transparent p-0 text-[12px] text-accent hover:underline"
                >
                  {t('home.setup.otherOptions')}
                </button>
              )}
              <button
                type="button"
                onClick={() => (row.id === 'speech' ? setUpSpeech() : openPane(row.pane))}
                disabled={row.id === 'speech' && running}
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
