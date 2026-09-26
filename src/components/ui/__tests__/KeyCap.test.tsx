import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { KeyCap, KeyCaps } from '../KeyCap'

describe('KeyCap (plan compact-key-labels)', () => {
  it('draws a side-specific modifier as its symbol plus a small side letter', () => {
    const { container } = render(<KeyCap name="RightControl" />)
    const kbd = container.querySelector('kbd')!
    expect(kbd).toHaveClass('kbd')
    expect(kbd).toHaveAttribute('title', 'Right Control')
    const visible = kbd.querySelector('[aria-hidden="true"]')!
    expect(visible.querySelector('.kbd-glyph')).toHaveTextContent('⌃')
    expect(visible.querySelector('.kbd-side')).toHaveTextContent('R')
    expect(kbd.querySelector('.sr-only')).toHaveTextContent('Right Control')
  })

  it('draws a generic modifier as the bare symbol', () => {
    const { container } = render(<KeyCap name="Shift" />)
    const kbd = container.querySelector('kbd')!
    expect(kbd).toHaveAttribute('title', 'Shift')
    expect(kbd.querySelector('.kbd-side')).toBeNull()
    expect(kbd.querySelector('.kbd-glyph')).toHaveTextContent('⇧')
    expect(kbd.querySelector('.sr-only')).toHaveTextContent('Shift')
  })

  it('draws a key whose label is its full name as plain text', () => {
    const { container } = render(<KeyCap name="End" className="kbd kbd-large" />)
    const kbd = container.querySelector('kbd')!
    expect(kbd.textContent).toBe('End')
    expect(kbd).toHaveClass('kbd-large')
    expect(kbd).toHaveAttribute('title', 'End')
    expect(kbd.querySelector('.sr-only')).toBeNull()
  })

  it('shows esc for Escape with the full name for screen readers', () => {
    const { container } = render(<KeyCap name="Escape" />)
    const kbd = container.querySelector('kbd')!
    expect(kbd.querySelector('[aria-hidden="true"]')).toHaveTextContent('esc')
    expect(kbd.querySelector('.kbd-glyph')).toBeNull()
    expect(kbd.querySelector('.sr-only')).toHaveTextContent('Escape')
  })

  it('joins caps with " + " inside a sentence', () => {
    const { container } = render(
      <p>
        <KeyCaps keys={['End', 'RightShift']} joiner="plus" />
      </p>,
    )
    expect(container.querySelectorAll('kbd')).toHaveLength(2)
    expect(container.querySelector('p')!.textContent).toBe('End + ⇧RRight Shift')
  })
})
