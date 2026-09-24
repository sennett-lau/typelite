/**
 * Parses the "extra request fields" text of an AI preset. These fields are merged into every
 * chat request, for example `{"reasoning_effort": "none"}` to turn off thinking.
 *
 * Empty text means no extra fields. Returns null unless the text is a JSON object
 * (arrays, strings, numbers and `null` are rejected).
 */
export function parseExtraFields(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {}
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}
