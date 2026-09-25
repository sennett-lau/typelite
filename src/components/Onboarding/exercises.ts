import type { ShortcutRole } from './shortcutConfig'

/**
 * Plan 0013: the scripted exercises of the three shortcut steps, and their forgiving success
 * checks. Speech and models vary, so a check looks for a key word or a visible change, never
 * for exact text.
 */

export type ExerciseId =
  | 'correction'
  | 'fillers'
  | 'speakTranslate'
  | 'selectionTranslate'
  | 'question'
  | 'edit'

export interface Exercise {
  id: ExerciseId
  /**
   * `speak`: the user reads a script into an empty box. `selection`: the box is pre-filled and
   * selected, and the shortcut works on that selection.
   */
  kind: 'speak' | 'selection'
}

export const EXERCISES: Record<ShortcutRole, Exercise[]> = {
  dictation: [
    { id: 'correction', kind: 'speak' },
    { id: 'fillers', kind: 'speak' },
  ],
  translate: [
    { id: 'speakTranslate', kind: 'speak' },
    { id: 'selectionTranslate', kind: 'selection' },
  ],
  ask: [
    { id: 'question', kind: 'speak' },
    { id: 'edit', kind: 'selection' },
  ],
}

/** Pre-filled text of the highlight-and-translate exercise, always in another language than the target. */
export const SELECTION_TRANSLATE_PREFILL = {
  zh: '今天下午三点开会',
  en: 'The meeting starts at three this afternoon.',
} as const

/** Chinese for an English target, English for every other target. */
export function selectionTranslatePrefill(target: string): string {
  return isEnglish(target) ? SELECTION_TRANSLATE_PREFILL.zh : SELECTION_TRANSLATE_PREFILL.en
}

function isEnglish(code: string): boolean {
  return code === 'en' || code.startsWith('en-')
}

/** What one run produced, as the checks see it. */
export interface CheckInput {
  /** Raw transcript of this run ("You said"); empty when nothing was spoken. */
  said: string
  /** Text box content when the run started. */
  before: string
  /** Text box content now. */
  boxText: string
  /** The exercise's pre-filled text (empty for speak exercises). */
  prefill: string
  /** The Ask answer, when Ask produced one. */
  answer: string | null
  /** The translation target language code. */
  target: string
}

/**
 * The text a paste added to the box: `after` minus the common start and end it shares with
 * `before`. Covers typing at the cursor and replacing a selection.
 */
export function insertedText(before: string, after: string): string {
  let start = 0
  const max = Math.min(before.length, after.length)
  while (start < max && before[start] === after[start]) start += 1
  let end = 0
  while (end < max - start && before[before.length - 1 - end] === after[after.length - 1 - end]) {
    end += 1
  }
  return after.slice(start, after.length - end).trim()
}

/** Lower-case letters and digits only, so punctuation and spacing do not count as a change. */
export function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

function differs(a: string, b: string): boolean {
  return normalizeForCompare(a) !== normalizeForCompare(b)
}

type Script = 'latin' | 'han' | 'kana' | 'hangul' | 'cyrillic' | 'arabic' | 'devanagari' | 'thai'

const SCRIPT_PATTERNS: Record<Script, RegExp> = {
  latin: /\p{Script=Latin}/u,
  han: /\p{Script=Han}/u,
  kana: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  hangul: /\p{Script=Hangul}/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  arabic: /\p{Script=Arabic}/u,
  devanagari: /\p{Script=Devanagari}/u,
  thai: /\p{Script=Thai}/u,
}

/** The scripts a language is written in; Japanese mixes kanji and kana. */
function scriptsOf(code: string): Script[] {
  if (code.startsWith('zh')) return ['han']
  if (code === 'ja') return ['han', 'kana']
  if (code === 'ko') return ['hangul']
  if (code === 'ru' || code === 'uk') return ['cyrillic']
  if (code === 'ar') return ['arabic']
  if (code === 'hi') return ['devanagari']
  if (code === 'th') return ['thai']
  return ['latin']
}

/**
 * A script-level guess that `text` is in language `code`: at least half of its letters are in
 * the language's script (Japanese also needs some kana). It cannot tell apart languages that
 * share a script (English and French), so for those it only says "Latin letters".
 */
export function looksLikeLanguage(text: string, code: string): boolean {
  const expected = scriptsOf(code)
  let letters = 0
  let matching = 0
  let kana = 0
  for (const char of text) {
    if (!/\p{L}/u.test(char)) continue
    letters += 1
    if (expected.some((script) => SCRIPT_PATTERNS[script].test(char))) matching += 1
    if (SCRIPT_PATTERNS.kana.test(char)) kana += 1
  }
  if (letters === 0) return false
  if (code === 'ja' && kana === 0) return false
  return matching / letters >= 0.5
}

/** "Let's do it at 2": a two (digit, word or Chinese) and no "at 1" / 一点 left over. */
function keptCorrection(text: string): boolean {
  const hasTwo = /2|\btwo\b|两|兩|二/i.test(text)
  const hasOne = /\bat (1|one)\b|\b1 ?o'?clock\b|\bone o'?clock\b|1\s*[点點]|一[点點]/i.test(text)
  return hasTwo && !hasOne
}

function mentionsFriday(text: string): boolean {
  return /friday|周五|週五|星期五|礼拜五|禮拜五/i.test(text)
}

/** True when the answer says 36 (as a number or in Chinese). */
export function mentions36(answer: string | null): boolean {
  return Boolean(answer && /(^|\D)36(\D|$)|三十六/.test(answer))
}

/** The Ask answer, or the text Ask typed into the box. */
function askOutput(input: CheckInput): string {
  return (input.answer ?? '').trim() || insertedText(input.before, input.boxText)
}

/** True when Ask replaced the selection in the box (the expected result of the Ask edit). */
function replacedSelection(input: CheckInput): boolean {
  return input.boxText.trim().length > 0 && differs(input.boxText, input.prefill)
}

/**
 * For the Ask edit: the box when Ask replaced the selection, else (the fallback when the
 * replacement could not be made) the answer panel's text.
 */
function editOutput(input: CheckInput): string {
  return replacedSelection(input) ? input.boxText.trim() : (input.answer ?? '').trim()
}

/** The "Typelite wrote" text of a run. */
export function wroteText(id: ExerciseId, input: CheckInput): string {
  switch (id) {
    case 'selectionTranslate':
      return input.boxText.trim()
    case 'question':
      return askOutput(input)
    case 'edit':
      return editOutput(input)
    default:
      return insertedText(input.before, input.boxText)
  }
}

/** The forgiving success check of each exercise (see exercises.md). */
export function checkExercise(id: ExerciseId, input: CheckInput): boolean {
  const wrote = wroteText(id, input)
  switch (id) {
    case 'correction':
      return wrote.length > 0 && keptCorrection(wrote)
    case 'fillers':
      return wrote.length > 0 && mentionsFriday(wrote)
    case 'speakTranslate':
      // It must differ from what was said, unless what was said is already in the target
      // language (then a translation cannot look different, and the text landing is enough).
      return (
        wrote.length > 0 &&
        (!input.said.trim() ||
          differs(wrote, input.said) ||
          looksLikeLanguage(input.said, input.target))
      )
    case 'selectionTranslate':
      return (
        wrote.length > 0 && differs(wrote, input.prefill) && looksLikeLanguage(wrote, input.target)
      )
    case 'question':
      return wrote.length > 0
    case 'edit':
      // Expected: the selection was replaced by a shorter version. Fallback: the shorter
      // version shows in the Ask panel (copied) when the replacement could not be made.
      return (
        wrote.length > 0 &&
        differs(wrote, input.prefill) &&
        wrote.length < input.prefill.trim().length
      )
  }
}
