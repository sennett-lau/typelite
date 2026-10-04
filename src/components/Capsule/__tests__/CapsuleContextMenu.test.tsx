import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { CapsuleContextMenu } from '../CapsuleContextMenu'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: { getByLabel: vi.fn() } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('CapsuleContextMenu', () => {
  it.each([
    ['capsule.menu.openMainWindow', '#/'],
    ['capsule.menu.settings', '#/settings'],
  ])(
    '%s shows and focuses the main window, navigates, and closes the menu',
    async (label, hash) => {
      const show = vi.fn().mockResolvedValue(undefined)
      const setFocus = vi.fn().mockResolvedValue(undefined)
      vi.mocked(WebviewWindow.getByLabel).mockResolvedValue({
        show,
        setFocus,
      } as unknown as WebviewWindow)
      const onClose = vi.fn()
      render(<CapsuleContextMenu onClose={onClose} />)

      fireEvent.click(screen.getByRole('menuitem', { name: label }))

      expect(onClose).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(emitTo).toHaveBeenCalledWith('main', 'navigate', hash))
      expect(WebviewWindow.getByLabel).toHaveBeenCalledWith('main')
      expect(show).toHaveBeenCalledTimes(1)
      expect(setFocus).toHaveBeenCalledTimes(1)
    },
  )

  it('closes the menu even when the main window no longer exists', async () => {
    vi.mocked(WebviewWindow.getByLabel).mockResolvedValue(null)
    const onClose = vi.fn()
    render(<CapsuleContextMenu onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'capsule.menu.settings' }))
    await waitFor(() => expect(WebviewWindow.getByLabel).toHaveBeenCalledWith('main'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(emitTo).not.toHaveBeenCalled()
  })

  it('exits through the process plugin and closes the menu', async () => {
    const onClose = vi.fn()
    render(<CapsuleContextMenu onClose={onClose} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'capsule.menu.exit' }))
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('plugin:process|exit', { code: 0 }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
