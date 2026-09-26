/**
 * Placeholder values for `t()` (plan `tutorial-one-page`): the translated text keeps a marker
 * where each group of key caps goes, and `KeyText` draws the caps there.
 */
export const KEY_TOKENS = { key: '⟦key⟧', stop: '⟦stop⟧', switch: '⟦switch⟧' } as const

export type KeyTokenName = keyof typeof KEY_TOKENS
