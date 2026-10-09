import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cancelVoiceCommand, confirmVoiceCommand } from '../../lib/tauri'
import type { VoiceCommandOutcome } from '../../lib/tauri'

/** The i18n key for an outcome's message in the Ask panel. */
function voiceCommandMessageKey(outcome: VoiceCommandOutcome): string {
  switch (outcome.status) {
    case 'needsConfirm':
      return 'voiceCommands.confirmQuit'
    case 'noMatch':
      return outcome.action === 'run_shortcut'
        ? 'voiceCommands.noShortcut'
        : outcome.action === 'open_folder'
          ? 'voiceCommands.noFolder'
          : 'voiceCommands.noApp'
    case 'ambiguous':
      return 'voiceCommands.ambiguous'
    case 'notRunning':
      return 'voiceCommands.notRunning'
    case 'invalidUrl':
      return 'voiceCommands.invalidUrl'
    case 'done':
      return `voiceCommands.pill.${outcome.action}`
    default:
      return 'voiceCommands.failed'
  }
}

/**
 * Plan `voice-commands`: the Ask panel for a spoken command: a short message ("No app called
 * X"), or for quit a Confirm / Cancel question. The panel never takes focus; Escape closes it
 * from the app, which also cancels the quit.
 */
export function VoiceCommandBody({ outcome }: { outcome: VoiceCommandOutcome }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const token = outcome.confirmToken

  return (
    <>
      <div className="ask-glass-answer" data-testid="ask-voice-command">
        {t(voiceCommandMessageKey(outcome), {
          target: outcome.target,
          candidates: outcome.candidates.join(', '),
        })}
        {failed && (
          <p className="mt-1 text-white/70" role="status">
            {t('voiceCommands.failed')}
          </p>
        )}
      </div>
      {outcome.status === 'needsConfirm' && token && (
        <div className="flex items-center justify-end gap-1.5 pt-2 pr-2.5 pl-3.5">
          <button
            type="button"
            className="ask-glass-button"
            onClick={() => {
              cancelVoiceCommand().catch(() => {})
            }}
          >
            {t('voiceCommands.cancel')}
          </button>
          <button
            type="button"
            className="ask-glass-button ask-glass-button-primary"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              confirmVoiceCommand(token)
                .catch(() => setFailed(true))
                .finally(() => setBusy(false))
            }}
          >
            {t('voiceCommands.confirmQuitButton', { target: outcome.target })}
          </button>
        </div>
      )}
    </>
  )
}
