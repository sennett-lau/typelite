import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, RotateCw } from 'lucide-react'
import {
  bindingFromHotkey,
  displayBinding,
  hotkeyBindingIdentity,
  useAppStore,
} from '../../stores/appStore'
import type { HotkeyConfig, ShortcutBinding, VoiceMode } from '../../stores/appStore'
import { resumeHotkey } from '../../lib/tauri'
import { TARGET_LANGUAGES } from '../../lib/constants'
import { HotkeyRecorder } from '../Settings/ShortcutBindingList'
import { Field } from './presetStepParts'
import { persistConfig } from './persistConfig'
import { usePracticeCompletion } from './usePracticeCompletion'
import { LIST_KEY, roleBindings, translationWithFirstTarget } from './shortcutConfig'
import type { ShortcutRole } from './shortcutConfig'

const ROLE_MODE: Record<ShortcutRole, VoiceMode> = {
  dictation: 'dictate',
  translate: 'translate',
  ask: 'ask',
}

interface Props {
  role: ShortcutRole
  done: boolean
  onDone: () => void
}

/**
 * Steps 5–7: record the shortcut by pressing keys, then use it once in the practice box.
 * The step is complete when a real run worked (see `usePracticeCompletion`).
 */
export function ShortcutStep({ role, done, onDone }: Props) {
  const { t } = useTranslation()
  const hotkeys = useAppStore((s) => s.config.hotkeys)
  const translation = useAppStore((s) => s.config.translation)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const [practiceText, setPracticeText] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  const bindings = roleBindings(hotkeys, role)
  const current = bindings[0] ?? null
  const keyLabel = current ? displayBinding(current) : ''
  const practice = usePracticeCompletion(ROLE_MODE[role], onDone)

  // Shortcuts are registered at app start even during onboarding. Register them again when
  // the step opens, so a shortcut paused by an earlier recording or a late Accessibility
  // grant works now.
  const makeLive = useCallback(() => {
    setLiveError(null)
    resumeHotkey().catch((error) => setLiveError(String(error)))
  }, [])
  useEffect(() => {
    makeLive()
  }, [makeLive])

  const otherBindings = (['dictation', 'translate', 'ask'] as ShortcutRole[])
    .filter((other) => other !== role)
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

  const pickLanguage = async (code: string) => {
    updateConfig({ translation: translationWithFirstTarget(translation, code) })
    setSaveError(null)
    try {
      await persistConfig()
    } catch (error) {
      setSaveError(String(error))
    }
  }

  const holdMode = role !== 'ask' && hotkeys.dictationMode === 'hold'
  const instructionKey = holdMode
    ? `onboarding.${role}.practiceHold`
    : `onboarding.${role}.practice`

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-text-secondary">
        {t(`onboarding.${role}.intro`)}
      </p>

      <div className="row-group">
        <Field label={t('onboarding.shortcut.label')}>
          <HotkeyRecorder
            value={keyLabel || t('onboarding.shortcut.notSet')}
            validateHotkey={validate}
            onSaved={(hotkey) => void save(hotkey)}
          />
          <p className="mt-1 text-[11px] text-text-tertiary">{t('onboarding.shortcut.hint')}</p>
        </Field>

        {role === 'translate' && (
          <Field label={t('onboarding.translate.languageLabel')}>
            <select
              aria-label={t('onboarding.translate.languageLabel')}
              value={translation.targets[0] ?? translation.active_target}
              onChange={(event) => void pickLanguage(event.target.value)}
              className="popup"
            >
              {TARGET_LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>
                  {language.labelKey ? t(language.labelKey) : language.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {saveError && (
        <p className="text-[12px] text-error">{t('onboarding.saveFailed', { error: saveError })}</p>
      )}
      {liveError && (
        <div className="flex items-start gap-2 text-[12px] text-error">
          <span className="flex-1">{t('onboarding.shortcut.notLive', { error: liveError })}</span>
          <button
            type="button"
            onClick={makeLive}
            className="inline-flex shrink-0 items-center gap-1 border-none bg-transparent text-[12px] text-text-secondary hover:text-text-primary cursor-pointer"
          >
            <RotateCw size={12} />
            {t('onboarding.retry')}
          </button>
        </div>
      )}

      <div className="row-group">
        <Field label={t('onboarding.practice.label')}>
          <p className="mb-2 text-[12px] leading-relaxed text-text-secondary">
            {current ? t(instructionKey, { key: keyLabel }) : t('onboarding.shortcut.recordFirst')}
          </p>
          <textarea
            aria-label={t('onboarding.practice.label')}
            value={practiceText}
            onChange={(event) => {
              setPracticeText(event.target.value)
              practice.notePracticeText(event.target.value)
            }}
            autoFocus
            rows={3}
            placeholder={t('onboarding.practice.placeholder')}
            className="field w-full resize-none text-[13px]"
          />
          {practice.answer && (
            <div className="mt-2 rounded-[8px] bg-bg-secondary px-3 py-2 text-[12px] text-text-primary">
              <p className="mb-0.5 text-[11px] text-text-tertiary">{t('onboarding.ask.answer')}</p>
              <p className="whitespace-pre-wrap">{practice.answer}</p>
            </div>
          )}
          {done ? (
            <p className="mt-2 flex items-center gap-1 text-[12px] text-success">
              <CheckCircle2 size={13} /> {t(`onboarding.${role}.success`)}
            </p>
          ) : (
            practice.error && (
              <p className="mt-2 text-[12px] text-error">
                {t('onboarding.practice.failed', { error: practice.error })}
              </p>
            )
          )}
        </Field>
      </div>
    </div>
  )
}
