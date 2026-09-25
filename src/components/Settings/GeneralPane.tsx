import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle } from 'lucide-react'
import { isMacPlatform, useAppStore } from '../../stores/appStore'
import type { HotkeyMode, OutputMode, ShortcutBinding } from '../../stores/appStore'
import {
  getPlatformCapabilities,
  getHotkeyStatus,
  resumeHotkey,
  startAskFlow,
} from '../../lib/tauri'
import type { HotkeyStatus } from '../../lib/tauri'
import { SegmentedControl } from './shared/SegmentedControl'
import { Toggle } from './shared/Toggle'
import { Group, Row } from '../ui/Group'
import { ShortcutBindingList } from './ShortcutBindingList'
import { SwitchLanguageShortcut } from './SwitchLanguageShortcut'
import { switchLanguageVariants } from '../../lib/switchLanguage'
import { MicrophonePicker } from './MicrophonePicker'

const MAC_ACCESSIBILITY_HOTKEY_ERROR = 'Accessibility permission may be denied'

export function GeneralPane() {
  const config = useAppStore((s) => s.config)
  const updateConfig = useAppStore((s) => s.updateConfig)
  const platformCapabilities = useAppStore((s) => s.platformCapabilities)
  const setPlatformCapabilities = useAppStore((s) => s.setPlatformCapabilities)
  const hotkeyRegistrationError = useAppStore((s) => s.hotkeyRegistrationError)
  const setHotkeyRegistrationError = useAppStore((s) => s.setHotkeyRegistrationError)
  const accessibilityTrusted = useAppStore((s) => s.accessibilityTrusted)
  const { t } = useTranslation()
  const isMac = isMacPlatform()
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyStatus | null>(null)
  const accessibilityRecoveryAttemptedRef = useRef(false)

  useEffect(() => {
    if (platformCapabilities) return
    getPlatformCapabilities()
      .then(setPlatformCapabilities)
      .catch((err) => {
        console.error('Failed to load platform capabilities:', err)
      })
  }, [platformCapabilities, setPlatformCapabilities])

  useEffect(() => {
    let cancelled = false
    getHotkeyStatus()
      .then((status) => {
        if (!cancelled) {
          setHotkeyStatus(status)
          setHotkeyRegistrationError(status.registration_error)
        }
      })
      .catch((err) => {
        console.error('Failed to load hotkey status:', err)
      })
    return () => {
      cancelled = true
    }
  }, [config.hotkeys, hotkeyRegistrationError, setHotkeyRegistrationError])

  useEffect(() => {
    if (
      !isMac ||
      !accessibilityTrusted ||
      !hotkeyRegistrationError?.includes(MAC_ACCESSIBILITY_HOTKEY_ERROR)
    ) {
      if (!hotkeyRegistrationError) {
        accessibilityRecoveryAttemptedRef.current = false
      }
      return
    }
    if (accessibilityRecoveryAttemptedRef.current) return
    accessibilityRecoveryAttemptedRef.current = true

    resumeHotkey()
      .then(() => {
        setHotkeyRegistrationError(null)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        setHotkeyRegistrationError(message)
      })
  }, [accessibilityTrusted, hotkeyRegistrationError, isMac, setHotkeyRegistrationError])

  const handleOpenAsk = useCallback(() => {
    startAskFlow().catch((err) => {
      console.error('Failed to start Ask flow:', err)
    })
  }, [])

  const hotkeyStatusMessage = hotkeyStatus?.conflict
    ? t('settings.hotkeyConflict')
    : hotkeyStatus && (!hotkeyStatus.dictation.valid || !hotkeyStatus.ask.valid)
      ? t('settings.hotkeyInvalid')
      : null
  const registrationErrorCoveredByAccessibilityBanner = Boolean(
    isMac &&
    !accessibilityTrusted &&
    hotkeyRegistrationError?.includes('Accessibility permission may be denied'),
  )
  const dictationBindings = config.hotkeys.dictationBindings?.length
    ? config.hotkeys.dictationBindings
    : [config.hotkeys.dictation]
  const askBindings = config.hotkeys.askBindings ?? (config.hotkeys.ask ? [config.hotkeys.ask] : [])
  const translateBindings =
    config.hotkeys.translateBindings ?? (config.hotkeys.translate ? [config.hotkeys.translate] : [])
  const secondaryBindings = [
    config.hotkeys.editSelection,
    config.hotkeys.switchScene,
    config.hotkeys.openApp,
  ].filter((binding): binding is ShortcutBinding => Boolean(binding))
  // The Switch language key (macOS only) may not be reused as another shortcut either.
  const switchLanguageBindings = isMac ? switchLanguageVariants(config.hotkeys.switchLanguage) : []
  const otherBindingsFor = (role: 'dictation' | 'ask' | 'translate') => [
    ...(role === 'dictation' ? [] : dictationBindings),
    ...(role === 'ask' ? [] : askBindings),
    ...(role === 'translate' ? [] : translateBindings),
    ...secondaryBindings,
    ...switchLanguageBindings,
  ]
  const updateCoreBindings = (
    role: 'dictation' | 'ask' | 'translate',
    bindings: ShortcutBinding[],
  ) => {
    const nextHotkeys = { ...config.hotkeys }
    if (role === 'dictation') {
      if (bindings.length === 0) return
      nextHotkeys.dictationBindings = bindings
      nextHotkeys.dictation = bindings[0]
    } else if (role === 'ask') {
      nextHotkeys.askBindings = bindings
      nextHotkeys.ask = bindings[0] ?? null
    } else {
      nextHotkeys.translateBindings = bindings
      nextHotkeys.translate = bindings[0] ?? null
    }
    updateConfig({ hotkeys: nextHotkeys })
  }

  const notes = [
    platformCapabilities && !platformCapabilities.globalHotkeyReliable
      ? { key: 'wayland', tone: 'warning', text: t('settings.waylandHotkeyLimited') }
      : null,
    hotkeyRegistrationError && !registrationErrorCoveredByAccessibilityBanner
      ? { key: 'registration', tone: 'error', text: t('settings.hotkeyRegistrationFailed') }
      : null,
    hotkeyStatusMessage ? { key: 'status', tone: 'warning', text: hotkeyStatusMessage } : null,
  ].filter((note): note is { key: string; tone: string; text: string } => note !== null)

  return (
    <div>
      <Group label={t('settings.hotkey')}>
        <ShortcutBindingList
          role="dictation"
          label={t('settings.dictationHotkey')}
          bindings={dictationBindings}
          otherBindings={otherBindingsFor('dictation')}
          required
          onChange={(bindings) => updateCoreBindings('dictation', bindings)}
        />
        <ShortcutBindingList
          role="translate"
          label={t('settings.translateHotkey')}
          bindings={translateBindings}
          otherBindings={otherBindingsFor('translate')}
          required={false}
          onChange={(bindings) => updateCoreBindings('translate', bindings)}
        />
        {isMac && (
          <SwitchLanguageShortcut
            binding={config.hotkeys.switchLanguage ?? null}
            otherBindings={[
              ...dictationBindings,
              ...askBindings,
              ...translateBindings,
              ...secondaryBindings,
            ]}
            onChange={(switchLanguage) =>
              updateConfig({ hotkeys: { ...config.hotkeys, switchLanguage } })
            }
          />
        )}
        <ShortcutBindingList
          role="ask"
          label={t('settings.askHotkey')}
          bindings={askBindings}
          otherBindings={otherBindingsFor('ask')}
          required={false}
          onChange={(bindings) => updateCoreBindings('ask', bindings)}
          trailingAction={
            <button
              type="button"
              aria-label={t('settings.tryAsk')}
              title={t('settings.tryAsk')}
              onClick={handleOpenAsk}
              className="btn-icon"
            >
              <MessageCircle size={13} />
            </button>
          }
        />
        {notes.length > 0 && (
          <Row>
            <div className="space-y-1 text-[12px] leading-relaxed">
              {notes.map((note) => (
                <p key={note.key} className={note.tone === 'error' ? 'text-error' : 'text-warning'}>
                  {note.text}
                </p>
              ))}
            </div>
          </Row>
        )}
      </Group>

      <Group label={t('settings.audio')}>
        <MicrophonePicker
          value={config.input_device}
          onChange={(v) => updateConfig({ input_device: v })}
        />
        <Row label={t('settings.muteOutputWhileRecording')} help={t('settings.muteOutputHint')}>
          <Toggle
            checked={config.mute_output_while_recording}
            onChange={(checked) => updateConfig({ mute_output_while_recording: checked })}
            label={t('settings.muteOutputWhileRecording')}
            hideLabel
          />
        </Row>
      </Group>

      <Group label={t('settings.dictation')}>
        <Row label={t('settings.dictationMode')}>
          <SegmentedControl
            ariaLabel={t('settings.dictationMode')}
            options={[
              { value: 'hold', label: t('settings.holdToTalk') },
              { value: 'toggle', label: t('settings.toggleOnOff') },
            ]}
            value={config.hotkey_mode}
            onChange={(v) => updateConfig({ hotkey_mode: v as HotkeyMode })}
          />
        </Row>
        <Row
          label={t('settings.outputMode')}
          help={
            config.output_mode === 'clipboard' &&
            platformCapabilities &&
            !platformCapabilities.clipboardAutoPasteReliable
              ? t('settings.waylandClipboardCopyOnly')
              : undefined
          }
        >
          <SegmentedControl
            ariaLabel={t('settings.outputMode')}
            options={[
              { value: 'keyboard', label: t('settings.keyboardSimulation') },
              { value: 'clipboard', label: t('settings.clipboardPaste') },
            ]}
            value={config.output_mode}
            onChange={(v) => {
              const outputMode = v as OutputMode
              updateConfig({
                output_mode: outputMode,
                insertion_strategy: outputMode === 'clipboard' ? 'clipboardPaste' : 'auto',
              })
            }}
          />
        </Row>
      </Group>
    </div>
  )
}
