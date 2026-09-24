import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores/appStore'
import { Group, Row } from '../ui/Group'
import { Toggle } from './shared/Toggle'

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
    </div>
  )
}
