import en from '../i18n/locales/en.json'

function lookup(key: string): string | undefined {
  let node: unknown = en
  for (const part of key.split('.')) {
    node = node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
  }
  return typeof node === 'string' ? node : undefined
}

/**
 * A tiny stand-in for i18next's `t` in tests: looks the key up in the English locale and
 * fills `{{name}}` placeholders. Like i18next, a list of keys uses the first one that exists.
 * Unknown keys come back unchanged.
 */
export function translate(key: string | string[], values?: Record<string, unknown>): string {
  const keys = Array.isArray(key) ? key : [key]
  let text = keys.map(lookup).find((found) => found !== undefined) ?? keys[0]
  for (const [name, value] of Object.entries(values ?? {})) {
    text = text.split(`{{${name}}}`).join(String(value))
  }
  return text
}
