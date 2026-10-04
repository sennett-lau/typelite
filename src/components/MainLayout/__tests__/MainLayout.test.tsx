import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it.each([
    ['Home', '#/'],
    ['Settings', '#/settings'],
    ['Dictionary', '#/dictionary'],
    ['About', '#/about'],
  ])('navigates to %s and marks only that page current', (label, hash) => {
    render(
      <MainLayout>
        <div>Page content</div>
      </MainLayout>,
    )
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(window.location.hash).toBe(hash)
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('button', { current: 'page' })).toHaveLength(1)
    expect(screen.getByText('Page content')).toBeInTheDocument()
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
    expect(Array.from(dots).map((dot) => dot.getAttribute('data-state'))).toEqual([
      'ok',
      'unknown',
      'off',
    ])

    act(() => {
      useAppStore.setState({ aiHealth: { presetId: ai.id, ok: false } })
    })
    expect(status.querySelectorAll('.status-dot')[1]).toHaveAttribute('data-state', 'error')
  })

  it('shows web search as a third line: Off, then Built-in with its last result', () => {
    useAppStore.setState(useAppStore.getInitialState())
    render(
      <MainLayout>
        <div>content</div>
      </MainLayout>,
    )
    const status = screen.getByTestId('connection-status')
    expect(status).toHaveTextContent('status.search · status.off')

    const { config } = useAppStore.getState()
    act(() => {
      useAppStore.setState({
        config: { ...config, web_search: { provider: 'builtin', base_url: '' } },
        searchHealth: { presetId: 'builtin', ok: true },
      })
    })
    expect(status).toHaveTextContent('status.search · webSearch.builtin')
    expect(status.querySelectorAll('.status-dot')[2]).toHaveAttribute('data-state', 'ok')

    // A result for another server does not colour the dot of the one in use.
    act(() => {
      useAppStore.setState({
        config: {
          ...config,
          web_search: { provider: 'searxng', base_url: 'http://10.0.0.2:8888' },
        },
      })
    })
    expect(status).toHaveTextContent('status.search · 10.0.0.2:8888')
    expect(status.querySelectorAll('.status-dot')[2]).toHaveAttribute('data-state', 'unknown')
  })
})
