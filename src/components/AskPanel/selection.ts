import { useEffect, useState, type RefObject } from 'react'

/**
 * Plan `ask-panel-select-text`: the text the user has highlighted inside `root`, or '' when the
 * selection is empty or reaches outside it. The text is only held in memory for the Copy button.
 */
export function selectedTextWithin(root: Node | null, selection: Selection | null): string {
  if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) return ''
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode) return ''
  if (!root.contains(anchorNode) || !root.contains(focusNode)) return ''
  const text = selection.toString()
  return text.trim() ? text : ''
}

/** What a Copy button copies: the highlighted part when there is one, else the whole text. */
export function textToCopy(selected: string, whole: string): string {
  return selected.trim() ? selected : whole
}

/** The text parts of the panel that can be highlighted (see `globals.css`). */
export const SELECTABLE_SELECTOR =
  '.ask-glass-answer, .ask-source-host, .ask-source-title, .ask-source-snippet'

/** ⌘C (no other modifier). */
export function isCopyShortcut(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'c'
  )
}

/** ⌘A (no other modifier). */
export function isSelectAllShortcut(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'a'
  )
}

/** True when a press on `target` is in highlightable text (and should make the panel key). */
export function pressStartsSelection(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SELECTABLE_SELECTOR) !== null
}

/** Follows the page selection and returns the part of it inside `ref` (see above). */
export function useSelectionWithin(ref: RefObject<Element | null>): string {
  const [selected, setSelected] = useState('')
  useEffect(() => {
    const update = () => setSelected(selectedTextWithin(ref.current, document.getSelection()))
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [ref])
  return selected
}
