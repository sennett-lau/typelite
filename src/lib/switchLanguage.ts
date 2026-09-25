import { bindingFromHotkey, displayBinding } from '../stores/appStore'
import type { ShortcutBinding } from '../stores/appStore'

/**
 * How the Switch language key reads in Settings and on Home: bare `Shift` means either Shift
 * key, so it says so; anything else uses the normal shortcut display.
 */
export function switchLanguageLabel(
  binding: ShortcutBinding | null,
  t: (key: string) => string,
): string {
  if (!binding) return t('settings.shortcutOff')
  if (binding.primary === 'Shift' && binding.modifiers.length === 0) {
    return t('settings.eitherShift')
  }
  return displayBinding(binding)
}

const EITHER_SIDE: Record<string, string[]> = {
  Shift: ['LeftShift', 'RightShift'],
  Ctrl: ['LeftControl', 'RightControl'],
  Option: ['LeftOption', 'RightOption'],
  Alt: ['LeftOption', 'RightOption'],
  Command: ['LeftCommand', 'RightCommand'],
  Super: ['LeftCommand', 'RightCommand'],
}

/**
 * The side-specific shortcuts the Switch language key stands for: generic modifiers mean
 * either side, so `Shift` is Left Shift and Right Shift (the Rust side registers it the same
 * way). Used for conflict checks against the other shortcuts.
 */
export function switchLanguageVariants(binding: ShortcutBinding | null): ShortcutBinding[] {
  if (!binding) return []
  let combos: string[][] = [[]]
  for (const key of [...binding.modifiers, binding.primary]) {
    const sides = EITHER_SIDE[key] ?? [key]
    combos = combos.flatMap((prefix) => sides.map((side) => [...prefix, side]))
  }
  return combos
    .map((keys) => bindingFromHotkey(keys.join('+')))
    .filter((variant): variant is ShortcutBinding => variant !== null)
}
