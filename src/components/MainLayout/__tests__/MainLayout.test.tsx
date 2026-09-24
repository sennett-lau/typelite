import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MainLayout } from '../index'
import { useAppStore } from '../../../stores/appStore'
import { activeAiPreset, activeSpeechPreset } from '../../../lib/connectionStatus'

const MOTION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'layoutId',
  'layout',
])

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => {
          const domProps: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(props)) {
            if (!MOTION_PROPS.has(key)) domProps[key] = value
          }
          return React.createElement(tag, domProps, children)
        },
    },
  ),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'app.name': 'Typelite',
        'app.tagline': 'AI Voice Input',
        'nav.home': 'Home',
        'nav.ask': 'Ask',
        'nav.settings': 'Settings',
        'nav.dictionary': 'Dictionary',
        'nav.about': 'About',
        'nav.mainNavigation': 'Main navigation',
      })[key] ?? key,
  }),
}))

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('MainLayout', () => {
  it('does not show Ask as a first-class navigation item', () => {
    render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )

    expect(screen.queryByRole('button', { name: 'Ask' })).not.toBeInTheDocument()
  })

  it('shows Home, Settings and Dictionary as tabs and About pinned at the bottom', () => {
    render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Home', 'Settings', 'Dictionary'])
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Home',
      'Settings',
      'Dictionary',
      'About',
    ])
    expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument()
  })

  it('navigates to About and marks it as the current page', () => {
    const { rerender } = render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    expect(window.location.hash).toBe('#/about')
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    rerender(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )
    expect(screen.getByRole('button', { name: 'About' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('navigates to the Dictionary tab', () => {
    render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dictionary' }))
    expect(window.location.hash).toBe('#/dictionary')
  })

  it('shows the active speech and AI presets with their last known status', () => {
    useAppStore.setState(useAppStore.getInitialState())
    const { config } = useAppStore.getState()
    const speech = activeSpeechPreset(config)
    const ai = activeAiPreset(config)
    useAppStore.setState({ speechHealth: { presetId: speech.id, ok: true }, aiHealth: null })

    render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )

    const status = screen.getByTestId('connection-status')
    expect(status).toHaveTextContent(`status.speech · ${speech.name}`)
    expect(status).toHaveTextContent(`status.ai · ${ai.name}`)
    const dots = status.querySelectorAll('.status-dot')
    expect(Array.from(dots).map((dot) => dot.getAttribute('data-state'))).toEqual(['ok', 'unknown'])

    act(() => {
      useAppStore.setState({ aiHealth: { presetId: ai.id, ok: false } })
    })
    expect(status.querySelectorAll('.status-dot')[1]).toHaveAttribute('data-state', 'error')
  })
})
