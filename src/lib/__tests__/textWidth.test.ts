import { afterEach, describe, expect, it, vi } from 'vitest'
import { measurePillNameWidth } from '../textWidth'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('measurePillNameWidth (plan `translate-pill-and-keys`)', () => {
  it('measures an invisible copy of the name styled like the pill name', () => {
    const appended: HTMLElement[] = []
    const original = document.body.appendChild.bind(document.body)
    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const element = node as unknown as HTMLElement
      appended.push(element)
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ width: 91.5 } as DOMRect)
      return original(node)
    })

    expect(measurePillNameWidth('Measured name')).toBe(91.5)
    expect(appended[0]).toHaveClass('pill-lang-name', 'pill-lang-name-probe')
    expect(appended[0]).toHaveTextContent('Measured name')
    // The probe is removed again, and the width is remembered.
    expect(document.body.contains(appended[0])).toBe(false)
    expect(measurePillNameWidth('Measured name')).toBe(91.5)
    expect(appended).toHaveLength(1)
  })

  it('estimates when there is no layout engine (CJK characters are wider)', () => {
    expect(measurePillNameWidth('English')).toBeCloseTo(7 * 6.8)
    expect(measurePillNameWidth('日本語')).toBe(36)
  })
})
