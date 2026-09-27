// Types for scripts/docs-cards.mjs, so the vitest test can import it (plans `docs-structure` and
// `model-guides`).

export interface CardSet {
  id: string
  dir: string
  table: string
  connections: Record<string, { label: string; page: string }>
  forbiddenEndings: string[]
  thinkingOff?: boolean
}

export type CardFields = Record<string, string | boolean>

export const REPO_ROOT: string
export const CARD_SETS: CardSet[]
export function parseCard(text: string): { fields: CardFields; body: string }
export function validateCard(set: CardSet, fileId: string, fields: CardFields, body: string): string[]
export function replaceBetweenMarkers(text: string, id: string, content: string): string
export function checkDocs(root?: string): string[]
export const LANGUAGE_GUIDES: { id: string; dir: string; table: string }
export const GUIDE_SECTIONS: string[]
export function validateLanguageGuide(
  fileId: string,
  fields: CardFields,
  body: string,
  root?: string,
): string[]
