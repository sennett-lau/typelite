import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { activeSpeechPreset } from '../../lib/connectionStatus'
import { engineOf } from '../../lib/speechTypes'
import { BuiltinSetupCard } from '../Speech/BuiltinSetupCard'
import { ServerPresetSheet } from '../Speech/ServerPresetSheet'

/**
 * Onboarding → Speech recognition (plan 0015): the Built-in card with its one main button,
 * then "Use your own server or API key…" (opens the sheet) and "Skip for now". Next unlocks
 * once Built-in is ready or a preset passed Test.
 */
export function SttSetupStep({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = useAppStore((s) => activeSpeechPreset(s.config))
  const usingServer = engineOf(active) === 'server' && Boolean(active.verified_at)

  return (
    <div>
      <BuiltinSetupCard />
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="link-button"
        >
          {t('speech.useOwnServer')}
        </button>
        <button type="button" onClick={onSkip} className="link-button link-button-muted">
          {t('onboarding.welcome.skipForNow')}
        </button>
      </div>
      {usingServer && (
        <p className="status-detail m-0 mt-2" data-testid="speech-using-server">
          {t('speech.usingPreset', { name: active.name })}
        </p>
      )}
      {sheetOpen && <ServerPresetSheet onClose={() => setSheetOpen(false)} />}
    </div>
  )
}
