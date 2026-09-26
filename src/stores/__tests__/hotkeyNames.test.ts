import { describe, expect, it } from 'vitest'
import {
  bindingFromHotkey,
  bindingKeyNames,
  capturedKeysNeedModifier,
  describeBinding,
  describeHotkey,
  displayBinding,
  displayHotkey,
  hotkeyBindingIdentity,
  hotkeyFromBinding,
  hotkeyFromCapturedKeys,
} from '../appStore'

describe('displayHotkey', () => {
  it('shows compact labels with the side as a plain letter', () => {
    expect(displayHotkey('End+RightShift')).toBe('End + ⇧R')
    expect(displayHotkey(['RightCommand', 'K'])).toBe('⌘R + K')
    expect(displayHotkey('Ctrl+/')).toBe('⌃ + /')
    expect(displayHotkey('PageDown')).toBe('Page Down')
    expect(displayHotkey('F13')).toBe('F13')
  })

  it('describes hotkeys with full key names', () => {
    expect(describeHotkey('End+RightShift')).toBe('End + Right Shift')
    expect(describeHotkey(['RightCommand', 'K'])).toBe('Right Command + K')
    expect(describeHotkey('Ctrl+/')).toBe('Control + /')
  })

  it('shows stored bindings in rank order whatever the stored primary is', () => {
    expect(displayBinding({ modifiers: ['End'], primary: 'RightControl' })).toBe('End + ⌃R')
    expect(describeBinding({ modifiers: ['End'], primary: 'RightControl' })).toBe(
      'End + Right Control',
    )
    expect(bindingKeyNames({ modifiers: ['RightShift'], primary: 'End' })).toEqual([
      'End',
      'RightShift',
    ])
    expect(displayBinding({ modifiers: ['Command', 'Shift'], primary: 'K' })).toBe('⌘ + ⇧ + K')
  })
})

describe('native key names', () => {
  it('accepts side-specific modifiers and F13+ as modifiers and primaries', () => {
    expect(bindingFromHotkey('rightcommand+k')).toEqual({
      primary: 'K',
      modifiers: ['RightCommand'],
    })
    expect(bindingFromHotkey('RightShift+Fn+End')).toEqual({
      primary: 'End',
      modifiers: ['Fn', 'RightShift'],
    })
    expect(bindingFromHotkey('F20')).toEqual({ primary: 'F20', modifiers: [] })
    expect(bindingFromHotkey('Home+LeftOption')).toEqual({
      primary: 'LeftOption',
      modifiers: ['Home'],
    })
    expect(bindingFromHotkey('End+End')).toBeNull()
  })

  it('keeps the users existing bindings valid', () => {
    for (const binding of [
      { modifiers: [], primary: 'End' },
      { modifiers: ['End'], primary: 'RightControl' },
      { modifiers: ['End'], primary: 'RightShift' },
    ]) {
      expect(bindingFromHotkey(hotkeyFromBinding(binding))).toEqual(binding)
    }
  })

  it('treats key order as irrelevant for identity', () => {
    expect(hotkeyBindingIdentity({ modifiers: ['End'], primary: 'RightShift' })).toBe(
      hotkeyBindingIdentity({ modifiers: ['RightShift'], primary: 'End' }),
    )
    expect(hotkeyBindingIdentity({ modifiers: ['Option'], primary: '/' })).toBe(
      hotkeyBindingIdentity({ modifiers: ['Alt'], primary: '/' }),
    )
  })
})

describe('hotkeyFromCapturedKeys', () => {
  it('uses the one non-modifier key as primary', () => {
    expect(hotkeyFromCapturedKeys(['End', 'RightShift'])).toBe('RightShift+End')
    expect(hotkeyFromCapturedKeys(['RightShift', 'End'])).toBe('RightShift+End')
    expect(hotkeyFromCapturedKeys(['LeftCommand', 'RightShift', 'K'])).toBe(
      'LeftCommand+RightShift+K',
    )
  })

  it('uses the first key when all keys are modifiers', () => {
    expect(hotkeyFromCapturedKeys(['RightControl', 'RightShift'])).toBe('RightShift+RightControl')
    expect(hotkeyFromCapturedKeys(['Fn'])).toBe('Fn')
  })

  it('prefers a typing key as primary when there are several non-modifiers', () => {
    expect(hotkeyFromCapturedKeys(['End', 'K'])).toBe('End+K')
    expect(hotkeyFromCapturedKeys(['End', 'F13'])).toBe('End+F13')
    expect(hotkeyFromCapturedKeys(['A', 'B'])).toBeNull()
  })

  it('flags single typing keys', () => {
    expect(capturedKeysNeedModifier(['A'])).toBe(true)
    expect(capturedKeysNeedModifier(['Space'])).toBe(true)
    expect(capturedKeysNeedModifier(['/'])).toBe(true)
    expect(capturedKeysNeedModifier(['F13'])).toBe(false)
    expect(capturedKeysNeedModifier(['End'])).toBe(false)
    expect(capturedKeysNeedModifier(['RightShift'])).toBe(false)
    expect(capturedKeysNeedModifier(['RightCommand', 'A'])).toBe(false)
  })
})
