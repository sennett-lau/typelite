import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw } from 'lucide-react'
import {
  bindingFromHotkey,
  displayBinding,
  hotkeyBindingIdentity,
  useAppStore,
} from '../../stores/appStore'
import type { HotkeyConfig, ShortcutBinding } from '../../stores/appStore'
import { resumeHotkey } from '../../lib/tauri'
import { HotkeyRecorder } from '../Settings/ShortcutBindingList'
import { EXERCISES } from './exercises'
import { KeyText } from './KeyCaps'
import { KEY_TOKENS } from './keyTokens'
import { persistConfig } from './persistConfig'
import { LIST_KEY, SHORTCUT_ROLES, bindingKeys, roleBindings } from './shortcutConfig'
import type { ShortcutRole } from './shortcutConfig'
import { TranslateLanguages } from './TranslateLanguages'
import { useLiveShortcuts } from './useLiveShortcuts'

/**
 * Plan `tutorial-one-page`: the setup page of one shortcut. Only its keys, as large key caps
 * (click to record new ones), and for Translate the languages with a pill preview. Recording is
 * always press to start, press again to stop here; hold-to-talk stays in Settings.
 */
export function ShortcutSetupPage({ role }: { role: ShortcutRole }) {
  const { t } = useTranslation()
  const hotkeys = useAppStore((s) => s.config.hotkeys)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const [saveError, setSaveError] = useState<string | null>(null)
  const live = useLiveShortcuts()

  const bindings = roleBindings(hotkeys, role)
  const current = bindings[0] ?? null
  const keys = bindingKeys(current)

  const otherBindings = SHORTCUT_ROLES.filter((other) => other !== role)
    .flatMap((other) => roleBindings(hotkeys, other))
    .concat(
      [hotkeys.editSelection, hotkeys.switchScene, hotkeys.openApp].filter(
        (binding): binding is ShortcutBinding => Boolean(binding),
      ),
    )

  const validate = (hotkey: string) => {
    const candidate = bindingFromHotkey(hotkey)
    if (!candidate) return t('shortcutCapture.invalid')
    const identity = hotkeyBindingIdentity(candidate)
    return otherBindings.some((binding) => hotkeyBindingIdentity(binding) === identity)
      ? t('shortcutCapture.conflict')
      : null
  }

  const save = async (hotkey: string) => {
    const binding = bindingFromHotkey(hotkey)
    if (!binding) return
    const identity = hotkeyBindingIdentity(binding)
    // Replace the primary shortcut; keep any extra ones from Settings.
    const list = [
      binding,
      ...bindings.slice(1).filter((other) => hotkeyBindingIdentity(other) !== identity),
    ]
    const next: HotkeyConfig = { ...hotkeys, [LIST_KEY[role]]: list }
    if (role === 'dictation') next.dictation = binding
    else next[role] = binding
    updateConfig({ hotkeys: next })
    setSaveError(null)
    try {
      await persistConfig()
      await resumeHotkey()
    } catch (error) {
      setSaveError(String(error))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="tutorial-card flex flex-col items-center gap-2.5 px-4 pt-[18px] pb-3.5">
        <HotkeyRecorder
          large
          value={current ? displayBinding(current) : t('onboarding.setup.notSet')}
          keycaps={keys}
          validateHotkey={validate}
          onSaved={(hotkey) => void save(hotkey)}
        />
        <p className="m-0 text-center text-[12px] leading-relaxed text-text-tertiary">
          <KeyText
            text={t(`onboarding.setup.hint.${role}`, KEY_TOKENS)}
            keys={{ stop: keys.slice(0, 1) }}
          />{' '}
          {t('onboarding.setup.change')}
        </p>
      </div>

      {role === 'translate' && <TranslateLanguages onError={setSaveError} />}

      <p className="m-0 text-center text-[12px] text-text-secondary">
        {t('onboarding.setup.next', { count: EXERCISES[role].length })}
      </p>

      {saveError && (
        <p className="m-0 text-[12px] text-error">
          {t('onboarding.saveFailed', { error: saveError })}
        </p>
      )}
      {live.error && (
        <div className="flex items-start gap-2 text-[12px] text-error">
          <span className="flex-1">{t('onboarding.shortcut.notLive', { error: live.error })}</span>
          <button
            type="button"
            onClick={live.retry}
            className="inline-flex shrink-0 items-center gap-1 border-none bg-transparent text-[12px] text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <RotateCw size={12} />
            {t('onboarding.retry')}
          </button>
        </div>
      )}
    </div>
  )
}
