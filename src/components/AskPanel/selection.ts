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
