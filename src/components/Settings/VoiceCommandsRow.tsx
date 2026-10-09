import { useTranslation } from 'react-i18next'
import { Row } from '../ui/Group'
import { Toggle } from './shared/Toggle'

/**
 * Plan `voice-commands`: Settings → General, under the Ask anything shortcut. Off by default;
 * when on, Ask carries out simple spoken commands ("open Safari") instead of answering them.
 */
export function VoiceCommandsRow({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Row label={t('voiceCommands.setting')} help={t('voiceCommands.settingHint')}>
      <Toggle checked={enabled} onChange={onChange} label={t('voiceCommands.setting')} hideLabel />
    </Row>
  )
}
