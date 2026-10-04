/**
 * Settings → General: the Switch language key, drawn as Translate's sub-row (plan
 * `general-settings`), recorded and reset as before (plan `translate-controls`).
 */
import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SwitchLanguageShortcut } from '../SwitchLanguageShortcut'
import * as tauri from '../../../lib/tauri'
import type { ShortcutCaptureEvent } from '../../../lib/tauri'

vi.mock('../../../lib/tauri', () => ({
  SHORTCUT_CAPTURE_EVENT: 'hotkey:capture',
  pauseHotkey: vi.fn().mockResolvedValue(undefined),
  resumeHotkey: vi.fn().mockResolvedValue(undefined),
  startShortcutCapture: vi.fn().mockResolvedValue(undefined),
  stopShortcutCapture: vi.fn().mockResolvedValue(undefined),
}))

type CaptureListener = (event: { payload: ShortcutCaptureEvent }) => void
const captureListeners: CaptureListener[] = []

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: CaptureListener) => {
    captureListeners.push(handler)
    return () => {
      const index = captureListeners.indexOf(handler)
      if (index >= 0) captureListeners.splice(index, 1)
    }
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const shift = { primary: 'Shift', modifiers: [] }
const rightOption = { primary: 'RightOption', modifiers: [] }
// The user's own bindings: Dictate End, Translate End + Right Shift.
const end = { primary: 'End', modifiers: [] }
const endRightShift = { primary: 'RightShift', modifiers: ['End'] }

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
}

function renderSwitch(props: Partial<ComponentProps<typeof SwitchLanguageShortcut>> = {}) {
  const onChange = vi.fn()
  render(
    <SwitchLanguageShortcut
      binding={shift}
      otherBindings={[end, endRightShift]}
      languageNames={['English', '日本語']}
      onChange={onChange}
      {...props}
    />,
  )
  const control = document.querySelector('[data-hotkey-role="switchLanguage"]') as HTMLElement
  return { control, onChange }
}

/** Clicks the field, then holds and releases `keys` as the native key listener reports them. */
async function record(control: HTMLElement, fieldName: string, keys: string[]) {
  vi.mocked(tauri.startShortcutCapture).mockClear()
  fireEvent.click(within(control).getByRole('button', { name: fieldName }))
  await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
  act(() => {
    for (const listener of [...captureListeners]) {
      listener({ payload: { held: keys, finished: false, cancelled: false } })
    }
  })
  act(() => {
    for (const listener of [...captureListeners]) {
      listener({ payload: { held: keys, finished: true, cancelled: false } })
    }
  })
}

describe('SwitchLanguageShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captureListeners.length = 0
    setPlatform('MacIntel')
  })
  afterEach(cleanup)

  it('names the languages it moves through in order', () => {
    renderSwitch({ languageNames: ['English', '日本語', 'Français'] })

    expect(screen.getByText('English → 日本語 → Français')).toBeInTheDocument()
  })

  it('leaves the language line out with fewer than two languages', () => {
    for (const languageNames of [['English'], []]) {
      renderSwitch({ languageNames })
      expect(screen.queryByText(/→/)).not.toBeInTheDocument()
      expect(screen.queryByText('English')).not.toBeInTheDocument()
      cleanup()
    }
  })

  it('records a new key by pressing it', async () => {
    const { control, onChange } = renderSwitch()

    await record(control, 'Shift', ['RightOption'])
    expect(onChange).toHaveBeenCalledWith(rightOption)
  })

  it('may be part of the Translate shortcut, but not the same as another shortcut', async () => {
    const { control, onChange } = renderSwitch()

    // Right Shift is part of Translate (End + Right Shift): allowed.
    await record(control, 'Shift', ['RightShift'])
    expect(onChange).toHaveBeenLastCalledWith({ primary: 'RightShift', modifiers: [] })

    // End is the Dictate shortcut: refused, and nothing is saved.
    onChange.mockClear()
    await record(control, 'Shift', ['End'])
    expect(onChange).not.toHaveBeenCalled()
    expect(within(control).getByText('shortcutCapture.conflict')).toBeDefined()
  })

  it('resets to Shift (either side); the reset is off while the key is Shift', () => {
    const atDefault = renderSwitch()
    expect(
      within(atDefault.control).getByRole('button', { name: 'settings.switchLanguageReset' }),
    ).toBeDisabled()
    cleanup()

    const changed = renderSwitch({ binding: rightOption })
    const reset = within(changed.control).getByRole('button', {
      name: 'settings.switchLanguageReset',
    })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)
    expect(changed.onChange).toHaveBeenCalledWith(shift)
  })
})
