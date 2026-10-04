import { describe, expect, it } from 'vitest'
import en from '../locales/en.json'
import zh from '../locales/zh.json'

const locales = { en, zh }

function leaves(value: unknown, prefix = ''): [string, unknown][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [[prefix, value]] : []
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('locale message coverage', () => {
  it('keeps every locale aligned with English leaf keys', () => {
    expect(
      leaves(zh)
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

  it('preserves interpolation variables across locales', () => {
    const variables = (value: unknown) =>
      [...String(value).matchAll(/\{\{\s*-?\s*([^},]+)(?:,[^}]+)?\}\}/g)]
        .map((match) => match[1].trim())
        .sort()
    const english = new Map(leaves(en))
    for (const [key, value] of leaves(zh)) {
      expect(variables(value), key).toEqual(variables(english.get(key)))
    }
  })
})
