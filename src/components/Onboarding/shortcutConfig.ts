import { bindingKeyNames } from '../../stores/appStore'
import type {
  AppConfig,
  HotkeyConfig,
  ShortcutBinding,
  TranslationConfig,
} from '../../stores/appStore'
import { MAX_TRANSLATION_TARGETS } from '../../lib/constants'
import { setShortcutGate } from '../../lib/tauri'
import type { GatedShortcutRole, ShortcutGate } from '../../lib/tauri'
import { EXERCISES } from './exercises'
import type { Exercise } from './exercises'

export type ShortcutRole = 'dictation' | 'translate' | 'ask'

export const SHORTCUT_ROLES: ShortcutRole[] = ['dictation', 'translate', 'ask']

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

/** The key names of a binding, in display order (`["Fn", "LeftShift"]`); empty when unset. */
export function bindingKeys(binding: ShortcutBinding | null | undefined): string[] {
  return binding ? bindingKeyNames(binding) : []
}

/**
 * Plan `tutorial-one-page`: one onboarding page of the shortcut part. Each role has a setup page
 * (its keys; Translate also its languages), then one page per exercise.
 */
export type ShortcutPage =
  | { role: ShortcutRole; kind: 'setup' }
  | { role: ShortcutRole; kind: 'exercise'; exercise: Exercise; number: number; total: number }

export const SHORTCUT_PAGES: ShortcutPage[] = SHORTCUT_ROLES.flatMap((role): ShortcutPage[] => [
  { role, kind: 'setup' },
  ...EXERCISES[role].map(
    (exercise, index): ShortcutPage => ({
      role,
      kind: 'exercise',
      exercise,
      number: index + 1,
      total: EXERCISES[role].length,
    }),
  ),
])

/** A setup page is done when the role has a shortcut, and Translate at least one language. */
export function setupComplete(config: AppConfig, role: ShortcutRole): boolean {
  if (roleBindings(config.hotkeys, role).length === 0) return false
  return role !== 'translate' || config.translation.targets.length > 0
}

/**
 * Plan `tutorial-one-page`: the translation config after adding `code` in the next free slot. The
 * first language becomes the active one.
 */
export function translationWithTarget(
  translation: TranslationConfig,
  code: string,
): TranslationConfig {
  const { targets } = translation
  if (!code || targets.includes(code) || targets.length >= MAX_TRANSLATION_TARGETS) {
    return translation
  }
  const active = targets.includes(translation.active_target) ? translation.active_target : code
  return { ...translation, targets: [...targets, code], active_target: active }
}

/**
 * The translation config after removing `code`. Removing the active language makes the first
 * remaining one active; removing the last one leaves no language.
 */
export function translationWithoutTarget(
  translation: TranslationConfig,
  code: string,
): TranslationConfig {
  const targets = translation.targets.filter((target) => target !== code)
  const active = targets.includes(translation.active_target)
    ? translation.active_target
    : (targets[0] ?? '')
  return { ...translation, targets, active_target: active }
}
