import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { activeAiPreset, activeSpeechPreset, endpointState } from '../../lib/connectionStatus'
import { isAiReady, isSpeechReady } from '../../lib/readiness'
import { settingsPaneHash } from '../../lib/router'
import { Group, Row } from '../ui/Group'

/**
 * "Finish setup" (plan 0007): one row per service that is not ready yet, with what it means
 * for the shortcuts and a "Set up" button to the right Settings tab. Hidden when both work.
 */
export function FinishSetup() {
  const { t } = useTranslation()
  const config = useAppStore((s) => s.config)
  const speechHealth = useAppStore((s) => s.speechHealth)
  const aiHealth = useAppStore((s) => s.aiHealth)

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

  return (
    <div className="mb-[22px]">
      <Group label={t('home.setup.title')}>
        {rows.map((row) => (
          <Row
            key={row.id}
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
              onClick={() => {
                window.location.hash = settingsPaneHash(row.pane)
              }}
              aria-label={`${t('home.setup.setUp')}: ${t(`home.setup.${row.id}`)}`}
              className="btn-accent"
            >
              {t('home.setup.setUp')}
            </button>
          </Row>
        ))}
      </Group>
    </div>
  )
}
