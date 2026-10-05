import { describe, expect, it, vi } from 'vitest'
import { HOVER_CLASS, moveHover, type PointerHover } from '../pointerHover'

function panel() {
  document.body.innerHTML = `
    <div id="card" style="cursor: pointer"><span id="title">Title</span></div>
    <p id="text">Answer</p>
    <button id="off" disabled style="cursor: pointer">Off</button>`
  const byId = (id: string) => document.getElementById(id)!
  return { card: byId('card'), title: byId('title'), text: byId('text'), off: byId('off') }
}

const start: PointerHover = { target: null, pointer: false }

describe('ask panel pointer hover (plan `ask-hover`)', () => {
  it('marks the element and its ancestors, and asks for the hand cursor', () => {
    const { card, title } = panel()
    const setCursor = vi.fn()
    const state = moveHover(start, title, setCursor)
    expect(title.classList.contains(HOVER_CLASS)).toBe(true)
    expect(card.classList.contains(HOVER_CLASS)).toBe(true)
    expect(state.pointer).toBe(true)
    expect(setCursor).toHaveBeenCalledWith(true)
  })

  it('moves the hover and restores the arrow once, then clears on leaving', () => {
    const { card, title, text } = panel()
    const setCursor = vi.fn()
    let state = moveHover(start, title, setCursor)
    state = moveHover(state, text, setCursor)
    expect(card.classList.contains(HOVER_CLASS)).toBe(false)
    expect(text.classList.contains(HOVER_CLASS)).toBe(true)
    expect(setCursor).toHaveBeenLastCalledWith(false)
    moveHover(state, null, setCursor)
    expect(text.classList.contains(HOVER_CLASS)).toBe(false)
    expect(document.body.classList.contains(HOVER_CLASS)).toBe(false)
    expect(setCursor).toHaveBeenCalledTimes(2)
  })

  it('sends the mouseover/mouseout pair React derives enter and leave from', () => {
    const { card, text } = panel()
    const over = vi.fn()
    const out = vi.fn()
    text.addEventListener('mouseover', over)
    text.addEventListener('mouseout', out)
    const state = moveHover(
      moveHover(start, card, () => {}),
      text,
      () => {},
    )
    moveHover(state, card, () => {})
    expect(over).toHaveBeenCalledTimes(1)
    expect(out).toHaveBeenCalledTimes(1)
  })

  it('keeps the arrow over a disabled button', () => {
    const { off } = panel()
    const setCursor = vi.fn()
    expect(moveHover(start, off, setCursor).pointer).toBe(false)
    expect(setCursor).not.toHaveBeenCalled()
  })
})
