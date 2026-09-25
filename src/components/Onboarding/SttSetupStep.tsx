import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { BuiltinSetupCard } from '../Speech/BuiltinSetupCard'
import { ServerPresetSheet } from '../Speech/ServerPresetSheet'
import { SPEECH_SERVICE, activePresetOf, type EngineService } from '../Speech/services'

/**
 * Onboarding → Speech recognition and → AI polish (plans `two-tab-speech` and `ai-polish-setup`):
 * the Built-in card with its one main button, then "Use your own server or API key…" (opens the
 * sheet) and "Skip for now". Next unlocks once Built-in is ready or a preset passed Test.
 */
export function EngineSetupStep({
  service,
  onSkip,
}: {
  service: EngineService
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const active = useAppStore((s) => activePresetOf(service, s.config))
  const usingServer = Boolean(active && !service.isBuiltin(active) && active.verified_at)

  return (
    <div>
      <BuiltinSetupCard service={service} />
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
          className="link-button"
        >
          {t('speech.useOwnServer')}
        </button>
        <button
          type="button"
          onClick={onSkip}
          title={service.id === 'ai' ? t('ai.skipHint') : undefined}
          className="link-button link-button-muted"
        >
          {t('onboarding.welcome.skipForNow')}
        </button>
      </div>
      {usingServer && active && (
        <p className="status-detail m-0 mt-2" data-testid={`${service.textNs}-using-server`}>
          {t('speech.usingPreset', { name: active.name })}
        </p>
      )}
      {sheetOpen && <ServerPresetSheet service={service} onClose={() => setSheetOpen(false)} />}
    </div>
  )
}

export function SttSetupStep({ onSkip }: { onSkip: () => void }) {
  return <EngineSetupStep service={SPEECH_SERVICE} onSkip={onSkip} />
}
