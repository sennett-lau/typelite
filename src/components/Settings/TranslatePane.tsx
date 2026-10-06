import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useAppStore } from '../../stores/appStore'
import { Group } from '../ui/Group'
import { LanguageRows } from './languages/LanguageRows'
import { LANGUAGE_PRESETS_GUIDE_URL, useLibraryStatus } from './languages/languageLibrary'
import { LanguageSheet } from './languages/LanguageSheet'

/**
 * Settings → Translate (plan `settings-order`): the languages the Translate shortcut translates
 * into, one row per language with its instructions sheet (plan `language-prompt-library`). It
 * used to be the Translation group of Settings → AI; it has its own pane so Settings follows the
 * three shortcuts (Dictate → Prompts, Translate → Translate, Ask anything → Search). The
 * Translate shortcut itself stays in General with the other shortcuts.
 */
export function TranslatePane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const { t } = useTranslation()
  const [editingLanguage, setEditingLanguage] = useState<string | null>(null)
  const libraryStatus = useLibraryStatus()

  return (
    <div>
      <Group
        label={t('settings.groupTranslation')}
        actions={
          <button
            type="button"
            onClick={() =>
              openUrl(LANGUAGE_PRESETS_GUIDE_URL).catch((error) =>
                console.error('[settings] failed to open the guide', error),
              )
            }
            className="link-button normal-case tracking-normal"
          >
            {t('translate.language.aboutPresets')}
          </button>
        }
      >
        {/* There is no "Always translate output" switch: Dictate never translates by itself
            (plan `translation-language-presets`). */}
        <LanguageRows
          config={config}
          status={libraryStatus}
          onChange={(translation) => updateConfig({ translation })}
          onEdit={setEditingLanguage}
        />
      </Group>

      {editingLanguage && (
        <LanguageSheet
          code={editingLanguage}
          status={libraryStatus}
          onClose={() => setEditingLanguage(null)}
        />
      )}
    </div>
  )
}
