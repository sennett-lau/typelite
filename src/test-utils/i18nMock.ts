import en from '../i18n/locales/en.json'

/**
 * A tiny stand-in for i18next's `t` in tests: looks the key up in the English locale and
 * fills `{{name}}` placeholders. Unknown keys come back unchanged.
 */
export function translate(key: string, values?: Record<string, unknown>): string {
  let node: unknown = en
  for (const part of key.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
  }
  let text = typeof node === 'string' ? node : key
  for (const [name, value] of Object.entries(values ?? {})) {
    text = text.split(`{{${name}}}`).join(String(value))
  }
  return text
}
