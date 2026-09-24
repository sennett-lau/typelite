import type { HotkeyConfig, ShortcutBinding, TranslationConfig } from '../../stores/appStore'

export type ShortcutRole = 'dictation' | 'translate' | 'ask'

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
