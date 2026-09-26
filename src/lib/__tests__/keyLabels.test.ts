import { describe, expect, it } from 'vitest'
import { compactKeyLabel, fullKeyLabel, keyParts } from '../keyLabels'

describe('keyParts (plan compact-key-labels)', () => {
  it('uses the macOS symbol for each generic modifier, with no side', () => {
    expect(keyParts('Ctrl')).toEqual({ symbol: '⌃', full: 'Control' })
    expect(keyParts('Option')).toEqual({ symbol: '⌥', full: 'Option' })
    expect(keyParts('Alt')).toEqual({ symbol: '⌥', full: 'Option' })
    expect(keyParts('Shift')).toEqual({ symbol: '⇧', full: 'Shift' })
    expect(keyParts('Command')).toEqual({ symbol: '⌘', full: 'Command' })
    expect(keyParts('Super')).toEqual({ symbol: '⌘', full: 'Command' })
  })

  it('adds a side letter for side-specific modifiers', () => {
    expect(keyParts('RightControl')).toEqual({ symbol: '⌃', side: 'R', full: 'Right Control' })
    expect(keyParts('LeftControl')).toEqual({ symbol: '⌃', side: 'L', full: 'Left Control' })
    expect(keyParts('LeftOption')).toEqual({ symbol: '⌥', side: 'L', full: 'Left Option' })
    expect(keyParts('RightOption')).toEqual({ symbol: '⌥', side: 'R', full: 'Right Option' })
    expect(keyParts('RightShift')).toEqual({ symbol: '⇧', side: 'R', full: 'Right Shift' })
    expect(keyParts('LeftShift')).toEqual({ symbol: '⇧', side: 'L', full: 'Left Shift' })
    expect(keyParts('LeftCommand')).toEqual({ symbol: '⌘', side: 'L', full: 'Left Command' })
    expect(keyParts('RightCommand')).toEqual({ symbol: '⌘', side: 'R', full: 'Right Command' })
    expect(keyParts('RightAlt')).toEqual({ symbol: '⌥', side: 'R', full: 'Right Alt' })
  })

  it('uses symbols for Return, Delete, Tab, Escape and the arrows', () => {
    expect(keyParts('Enter')).toEqual({ symbol: '↩', full: 'Return' })
    expect(keyParts('Backspace')).toEqual({ symbol: '⌫', full: 'Delete' })
    expect(keyParts('Delete')).toEqual({ symbol: '⌦', full: 'Forward Delete' })
    expect(keyParts('Tab')).toEqual({ symbol: '⇥', full: 'Tab' })
    expect(keyParts('Escape')).toEqual({ symbol: 'esc', full: 'Escape' })
    expect(compactKeyLabel('Left')).toBe('←')
    expect(compactKeyLabel('Right')).toBe('→')
    expect(compactKeyLabel('Up')).toBe('↑')
    expect(compactKeyLabel('Down')).toBe('↓')
    expect(fullKeyLabel('Up')).toBe('Up Arrow')
  })

  it('leaves Fn, End, Home, Page keys, Space, F-keys, letters and digits unchanged', () => {
    for (const name of ['Fn', 'End', 'Home', 'Space', 'F5', 'F13', 'K', '7', '/']) {
      expect(keyParts(name)).toEqual({ symbol: name, full: name })
    }
    expect(keyParts('PageUp')).toEqual({ symbol: 'Page Up', full: 'Page Up' })
    expect(keyParts('PageDown')).toEqual({ symbol: 'Page Down', full: 'Page Down' })
  })

  it('writes the side as a plain letter in compact text', () => {
    expect(compactKeyLabel('RightShift')).toBe('⇧R')
    expect(compactKeyLabel('LeftOption')).toBe('⌥L')
    expect(compactKeyLabel('Shift')).toBe('⇧')
    expect(compactKeyLabel('End')).toBe('End')
    expect(fullKeyLabel('RightControl')).toBe('Right Control')
  })
})
