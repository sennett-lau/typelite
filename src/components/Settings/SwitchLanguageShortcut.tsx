import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import {
  bindingFromHotkey,
  bindingKeyNames,
  DEFAULT_SWITCH_LANGUAGE_HOTKEY,
  hotkeyBindingIdentity,
} from '../../stores/appStore'
import type { ShortcutBinding } from '../../stores/appStore'
import { HotkeyRecorder } from './ShortcutBindingList'
import { switchLanguageLabel, switchLanguageVariants } from '../../lib/switchLanguage'

interface SwitchLanguageShortcutProps {
  binding: ShortcutBinding | null
  /** Every other configured shortcut; the switch key must not repeat one of them. */
  otherBindings: ShortcutBinding[]
  /**
   * Names of the Translate languages the key moves through, in that order. With two or more
   * they show as a second help line: "English → 日本語".
   */
  languageNames: string[]
  onChange: (binding: ShortcutBinding | null) => void
}

/**
 * Settings → General → Shortcuts: the Switch language key (plan `translate-controls`), recorded by
 * pressing keys like the other shortcuts. It only listens while a Translate recording runs, so a
 * bare key such as Shift is fine. It may be part of the Translate shortcut (Fn + Shift with Shift);
 * it may not be the same as another shortcut.
 *
 * Plan `general-settings`: because it only works while translating, it is drawn as a sub-row of
 * Translate (a `.row-sub`, passed as Translate's `subRow`), not as a shortcut of its own.
 */
export function SwitchLanguageShortcut({
  binding,
  otherBindings,
  languageNames,
  onChange,
}: SwitchLanguageShortcutProps) {
  const { t } = useTranslation()
  const defaultBinding = bindingFromHotkey(DEFAULT_SWITCH_LANGUAGE_HOTKEY)
  const isDefault =
    binding !== null &&
    defaultBinding !== null &&
    hotkeyBindingIdentity(binding) === hotkeyBindingIdentity(defaultBinding)

  const validate = (hotkey: string) => {
    const candidate = bindingFromHotkey(hotkey)
    if (!candidate) return t('shortcutCapture.invalid')
    const taken = new Set(otherBindings.map(hotkeyBindingIdentity))
    return switchLanguageVariants(candidate).some((variant) =>
      taken.has(hotkeyBindingIdentity(variant)),
    )
      ? t('shortcutCapture.conflict')
      : null
  }

  return (
    <div className="row-sub">
      <div className="row-label pt-1">
        <span>{t('settings.switchLanguageHotkey')}</span>
        <span className="row-help">{t('settings.generalPane.switchLanguageDesc')}</span>
        {languageNames.length >= 2 && (
          <span className="row-help text-text-tertiary">{languageNames.join(' → ')}</span>
        )}
      </div>
      <div
        data-hotkey-role="switchLanguage"
        className="flex w-[280px] max-w-full min-w-0 items-start gap-1"
      >
        <div className="min-w-0 flex-1">
          <HotkeyRecorder
            value={switchLanguageLabel(binding, t)}
            keycaps={binding ? bindingKeyNames(binding) : undefined}
            validateHotkey={validate}
            onSaved={(hotkey) => {
              const next = bindingFromHotkey(hotkey)
              if (next) onChange(next)
            }}
          />
        </div>
        <button
          type="button"
          aria-label={t('settings.switchLanguageReset')}
          title={t('settings.switchLanguageReset')}
          disabled={isDefault}
          onClick={() => onChange(defaultBinding)}
          className="btn-icon"
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}
