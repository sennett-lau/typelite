import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapsuleContextMenu } from '../CapsuleContextMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'capsule.menu.openMainWindow': 'Open Main Window',
          'capsule.menu.settings': 'Settings',
          'capsule.menu.exit': 'Exit',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('CapsuleContextMenu', () => {
  it('lists only the local menu items, with no capsule visibility toggle', () => {
    render(<CapsuleContextMenu onClose={vi.fn()} />)

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Open Main Window',
      'Settings',
      'Exit',
    ])
  })
})
