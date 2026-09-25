import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { activeAiPreset, activeSpeechPreset, endpointState } from '../../lib/connectionStatus'
import { isAiReady, isSpeechReady } from '../../lib/readiness'
import { settingsPaneHash } from '../../lib/router'
import { isSetupRunning } from '../../stores/speechSetupStore'
import { Group, Row } from '../ui/Group'
import { SpeechSetupProgress } from '../Settings/QuickSpeechSetup'
import { beginSpeechSetup, useSpeechSetupStatus } from '../../hooks/useSpeechSetup'

/**
 * "Finish setup" (plan 0007): one row per service that is not ready yet, with what it means
 * for the shortcuts. Hidden when both work.
 *
 * Speech (plan 0012): "Set up" starts Quick setup right here (download a model and run it on
 * this Mac); the progress shows under the row until it is done. "Other options" opens
 * Settings → Speech. AI: "Set up" opens Settings → AI.
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
  const showProgress = running || (setupStatus.phase === 'error' && setupStatus.error !== null)

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
                onClick={() => (row.id === 'speech' ? beginSpeechSetup() : openPane(row.pane))}
                disabled={row.id === 'speech' && running}
                aria-label={`${t('home.setup.setUp')}: ${t(`home.setup.${row.id}`)}`}
                className="btn-accent"
              >
                {t('home.setup.setUp')}
              </button>
            </Row>
            {row.id === 'speech' && showProgress && (
              <Row>
                <div className="min-w-0 flex-1">
                  <SpeechSetupProgress />
                </div>
              </Row>
            )}
          </Fragment>
        ))}
      </Group>
    </div>
  )
}
