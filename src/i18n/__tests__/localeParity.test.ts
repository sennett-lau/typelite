import { describe, expect, it } from 'vitest'
import en from '../locales/en.json'
import { UI_LANGUAGES } from '../languages'

const locales = Object.fromEntries(
  UI_LANGUAGES.map((language) => [language.value, language.messages]),
)

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('locale message coverage', () => {
  it.each(Object.entries(locales))('%s has exactly the English keys', (_locale, messages) => {
    expect(
      leaves(messages)
        .map(([key]) => key)
        .sort(),
    ).toEqual(
      leaves(en)
        .map(([key]) => key)
        .sort(),
    )
  })

  it.each(Object.entries(locales))(
    '%s has a nonempty string for every message',
    (locale, messages) => {
      for (const [key, value] of leaves(messages)) {
        expect(typeof value, `${locale}.${key}`).toBe('string')
        expect((value as string).trim(), `${locale}.${key}`).not.toBe('')
      }
    },
  )

  it.each(Object.entries(locales))('%s keeps the English placeholders', (_locale, messages) => {
    const variables = (value: unknown) =>
      [...String(value).matchAll(/\{\{\s*-?\s*([^},]+)(?:,[^}]+)?\}\}/g)]
        .map((match) => match[1].trim())
        .sort()
    const english = new Map(leaves(en))
    for (const [key, value] of leaves(messages)) {
      expect(variables(value), key).toEqual(variables(english.get(key)))
    }
  })
})
