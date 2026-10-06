/**
 * Plan `ask-hover`: hover for the Ask panel. The Ask window is never the key window and Typelite
 * stays in the background, so WebKit sends the page no mouse moves: CSS `:hover`, the CSS cursor
 * and React's onMouseEnter never fire. The app sends the cursor position instead
 * (`ask:pointer`), and this marks the element under it and its ancestors with `is-hover` (styled
 * like `:hover`), sends the mouseover/mouseout pair React derives enter and leave from, and
 * asks for the hand cursor over anything whose CSS cursor is `pointer`.
 */

export const POINTER_EVENT = 'ask:pointer'
export const HOVER_CLASS = 'is-hover'

export interface PointerHover {
  /** The element under the cursor, or null when the cursor is not over the panel. */
  target: Element | null
  pointer: boolean
}

function chain(element: Element | null): Element[] {
  const elements: Element[] = []
  for (let node = element; node; node = node.parentElement) elements.push(node)
  return elements
}

function wantsPointer(element: Element | null): boolean {
  for (let node = element; node; node = node.parentElement) {
    if (node instanceof HTMLButtonElement && node.disabled) return false
    if (getComputedStyle(node).cursor === 'pointer') return true
  }
  return false
}

/**
 * Moves the hover from `previous.target` to `next`. Returns the new state; `setCursor` is called
 * only when the cursor kind changes.
 */
export function moveHover(
  previous: PointerHover,
  next: Element | null,
  setCursor: (pointer: boolean) => void,
): PointerHover {
  if (next === previous.target) return previous
  const before = chain(previous.target)
  const after = chain(next)
  for (const element of before) if (!after.includes(element)) element.classList.remove(HOVER_CLASS)
  for (const element of after) element.classList.add(HOVER_CLASS)
  previous.target?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: next }))
  next?.dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true, relatedTarget: previous.target }),
  )
  const pointer = wantsPointer(next)
  if (pointer !== previous.pointer) setCursor(pointer)
  return { target: next, pointer }
}
