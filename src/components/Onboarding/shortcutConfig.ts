import type { HotkeyConfig, ShortcutBinding, TranslationConfig } from '../../stores/appStore'
import { setShortcutGate } from '../../lib/tauri'
import type { GatedShortcutRole, ShortcutGate } from '../../lib/tauri'

export type ShortcutRole = 'dictation' | 'translate' | 'ask'

/**
 * Plan `onboarding-shortcut-gate`: the shortcut roles an onboarding page lets run. A page
 * that teaches no shortcut allows none; a shortcut exercise allows only its own role (the
 * Translate exercise also the Switch language key).
 */
export function shortcutGateForRole(role: ShortcutRole | undefined): GatedShortcutRole[] {
  switch (role) {
    case 'dictation':
      return ['dictation']
    case 'translate':
      return ['translate', 'switchLanguage']
    case 'ask':
      return ['ask']
    default:
      return []
  }
}

/**
 * Sends the gate to the backend. Never throws: a failed call is logged, and the backend's own
 * default (closed until onboarding is finished) still holds.
 */
export async function applyShortcutGate(allowed: ShortcutGate): Promise<void> {
  try {
    await setShortcutGate(allowed)
  } catch (error) {
    console.error('[onboarding] failed to set the shortcut gate', error)
  }
}

export const LIST_KEY = {
  dictation: 'dictationBindings',
  translate: 'translateBindings',
  ask: 'askBindings',
} as const satisfies Record<ShortcutRole, keyof HotkeyConfig>

/** All bindings of `role`, primary first (older configs may only have the primary). */
export function roleBindings(hotkeys: HotkeyConfig, role: ShortcutRole): ShortcutBinding[] {
  const list = hotkeys[LIST_KEY[role]]
  if (list?.length) return list
  const primary = role === 'dictation' ? hotkeys.dictation : hotkeys[role]
  return primary ? [primary] : []
}

/**
 * The translation config after picking `code` as the one target: it becomes the active
 * target and the first slot. If it already sat in another slot, the old first language
 * moves there, so the other slots (editable in Settings) keep their languages.
 */
export function translationWithFirstTarget(
  translation: TranslationConfig,
  code: string,
): TranslationConfig {
  const targets = [...translation.targets]
  const existing = targets.indexOf(code)
  if (existing > 0) targets[existing] = targets[0]
  if (targets.length === 0) targets.push(code)
  else targets[0] = code
  return { targets, active_target: code }
}
