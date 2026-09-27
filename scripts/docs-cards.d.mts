// Types for scripts/docs-cards.mjs, so the vitest test can import it (plans `docs-structure` and
// `model-guides`).

export type CardFields = Record<string, string | boolean>

export const REPO_ROOT: string
export function parseCard(text: string): { fields: CardFields; body: string }
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
/** One language guide's front matter plus its file name, as `readLanguageGuides` returns it. */
export interface LanguageGuide {
  file: string
  language: string
  codes: string
  speech: string
  polish: string
  tier: string
  preset?: string
  tested?: string
}
export function renderLanguageGuides(guides: LanguageGuide[]): string
export interface Step {
  id: string
  dir: string
  models: string
}
export const STEPS: Step[]
export const SERVICES_HEADER: string
export function validateServiceRow(row: string): string[]
export function validateStep(step: Step, root?: string): string[]
export function headingAnchor(heading: string): string
export function checkLinks(root?: string): string[]
