import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortcutBindingList } from '../ShortcutBindingList'
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
const unlisten = vi.fn()

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: CaptureListener) => {
    captureListeners.push(handler)
    return unlisten
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      ({
        'settings.pressKeyCombination': 'Press a key combination...',
        'settings.clickToConfirm': 'Click to confirm',
        'settings.shortcutAdd': 'Add shortcut',
        'settings.shortcutRemove': 'Remove shortcut',
        'settings.shortcutManage': 'Manage shortcut',
        'settings.shortcutMakePrimary': 'Make primary',
        'settings.shortcutPrimary': 'Primary',
        'settings.shortcutMax': 'Up to three shortcuts',
        'shortcutCapture.pressKeys': 'Press keys…',
        'shortcutCapture.hint': 'Release to save',
        'shortcutCapture.needsModifier': 'Needs a modifier',
        'shortcutCapture.conflict': 'Shortcut conflict',
        'shortcutCapture.invalid': 'Invalid shortcut',
        'shortcutCapture.failed': `Capture failed: ${options?.error}`,
        'common.cancel': 'Cancel',
      })[key] || key,
  }),
}))

const ctrlSlash = { primary: '/', modifiers: ['Ctrl'] }
const f8 = { primary: 'F8', modifiers: [] }
const f9 = { primary: 'F9', modifiers: [] }

function setPlatform(platform: string) {
  Object.defineProperty(window.navigator, 'platform', { value: platform, configurable: true })
}

/** Send one `hotkey:capture` event to the recorder, as the Rust listener would. */
function emitCapture(held: string[], finished = false, cancelled = false) {
  act(() => {
    for (const listener of captureListeners) listener({ payload: { held, finished, cancelled } })
  })
}

async function startCaptureOn(buttonName: string) {
  fireEvent.click(screen.getByRole('button', { name: buttonName }))
  await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
}

describe('ShortcutBindingList (macOS native capture)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captureListeners.length = 0
    setPlatform('MacIntel')
  })
  afterEach(cleanup)

  it('keeps a single required binding visually quiet', () => {
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Control + /' })).toBeInTheDocument()
    expect(screen.queryByText('Primary')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Manage shortcut' })).not.toBeInTheDocument()
  })

  it('shows the users End bindings readably', () => {
    render(
      <ShortcutBindingList
        role="ask"
        label="Ask"
        bindings={[{ modifiers: ['End'], primary: 'RightControl' }]}
        otherBindings={[]}
        required={false}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'End + Right Control' })).toBeInTheDocument()
  })

  it('starts capture immediately and provides an explicit cancel action', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }))
    await waitFor(() => expect(tauri.startShortcutCapture).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Press keys…' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Press keys…' })).not.toBeInTheDocument()
    expect(tauri.stopShortcutCapture).toHaveBeenCalled()
    expect(unlisten).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows held keys live and saves the chord when all keys are released', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="translate"
        label="Translate"
        bindings={[f8]}
        otherBindings={[]}
        required={false}
        onChange={onChange}
      />,
    )

    await startCaptureOn('F8')
    emitCapture(['End'])
    expect(screen.getByRole('button', { name: 'End' })).toBeInTheDocument()
    emitCapture(['End', 'RightShift'])
    expect(screen.getByRole('button', { name: 'End + Right Shift' })).toBeInTheDocument()
    emitCapture(['End', 'RightShift'], true)

    expect(onChange).toHaveBeenCalledWith([{ primary: 'End', modifiers: ['RightShift'] }])
    expect(tauri.stopShortcutCapture).toHaveBeenCalledTimes(1)
  })

  it('saves a single native-only key such as F13', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    await startCaptureOn('Control + /')
    emitCapture(['F13'], true)
    expect(onChange).toHaveBeenCalledWith([{ primary: 'F13', modifiers: [] }])
  })

  it('asks for a modifier when a single typing key is recorded', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    await startCaptureOn('Control + /')
    emitCapture(['A'], true)
    expect(screen.getByText('Needs a modifier')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(tauri.stopShortcutCapture).toHaveBeenCalled()
  })

  it('rejects a chord already used by another role, whatever the key order', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="ask"
        label="Ask"
        bindings={[f8]}
        otherBindings={[{ modifiers: ['End'], primary: 'RightShift' }]}
        required={false}
        onChange={onChange}
      />,
    )

    await startCaptureOn('F8')
    emitCapture(['End', 'RightShift'], true)
    expect(screen.getByText('Shortcut conflict')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels on Escape from the native listener', async () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    await startCaptureOn('Control + /')
    emitCapture(['End'])
    emitCapture(['End'], false, true)
    expect(screen.getByRole('button', { name: 'Control + /' })).toBeInTheDocument()
    expect(tauri.stopShortcutCapture).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows the error inline when the listener cannot start', async () => {
    vi.mocked(tauri.startShortcutCapture).mockRejectedValueOnce(
      'Failed to create macOS native hotkey EventTap; Accessibility permission may be denied',
    )
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Control + /' }))
    expect(
      await screen.findByText(/Capture failed: .*Accessibility permission may be denied/),
    ).toBeInTheDocument()
    expect(tauri.stopShortcutCapture).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Control + /' })).toBeInTheDocument()
  })

  it('stops capture when the field unmounts', async () => {
    const { unmount } = render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={vi.fn()}
      />,
    )

    await startCaptureOn('Control + /')
    unmount()
    expect(tauri.stopShortcutCapture).toHaveBeenCalled()
  })

  it('disables adding a fourth binding', () => {
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash, f8, f9]}
        otherBindings={[]}
        required
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add shortcut' })).toBeDisabled()
    expect(screen.getByText('Up to three shortcuts')).toBeInTheDocument()
  })

  it('manages multiple bindings from one restrained menu', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash, f8]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    expect(screen.getAllByText('Primary')).toHaveLength(1)
    const manageButtons = screen.getAllByRole('button', { name: 'Manage shortcut' })
    expect(manageButtons).toHaveLength(2)

    fireEvent.click(manageButtons[1])
    fireEvent.click(screen.getByRole('button', { name: 'Make primary' }))
    expect(onChange).toHaveBeenCalledWith([f8, ctrlSlash])
  })

  it('allows optional roles to remove their final binding', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="ask"
        label="Ask"
        bindings={[f8]}
        otherBindings={[]}
        required={false}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Manage shortcut' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove shortcut' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})

describe('ShortcutBindingList (web fallback off macOS)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    captureListeners.length = 0
    setPlatform('Win32')
  })
  afterEach(cleanup)

  it('records from keydown events and saves after confirming', () => {
    const onChange = vi.fn()
    render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add shortcut' }))
    expect(tauri.pauseHotkey).toHaveBeenCalled()
    expect(tauri.startShortcutCapture).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'F8' })
    fireEvent.click(screen.getByRole('button', { name: 'F8' }))
    expect(onChange).toHaveBeenCalledWith([ctrlSlash, f8])
    expect(tauri.resumeHotkey).toHaveBeenCalled()
  })

  it('resumes global hotkeys when capture is abandoned by unmounting', () => {
    const { unmount } = render(
      <ShortcutBindingList
        role="dictation"
        label="Dictate"
        bindings={[ctrlSlash]}
        otherBindings={[]}
        required
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Control + /' }))
    expect(tauri.pauseHotkey).toHaveBeenCalled()

    unmount()

    expect(tauri.resumeHotkey).toHaveBeenCalled()
  })
})
