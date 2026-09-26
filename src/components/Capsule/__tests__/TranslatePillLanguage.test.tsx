import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../../stores/appStore'
import { TranslatePillLanguage } from '../TranslatePillLanguage'
import {
  MARQUEE_GAP,
  MARQUEE_SPEED,
  marqueeDurationSeconds,
  nameDisplay,
  translatePillFor,
} from '../translatePill'

const motion = vi.hoisted(() => ({ reduced: false }))
const widths = vi.hoisted(() => new Map<string, number>())

vi.mock('framer-motion', () => ({
  useReducedMotion: () => motion.reduced,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}))

vi.mock('../../../lib/textWidth', () => ({
  measurePillNameWidth: (text: string) => widths.get(text) ?? 50,
}))

afterEach(() => {
  cleanup()
  motion.reduced = false
  widths.clear()
  useAppStore.setState(useAppStore.getInitialState())
})

function showLanguages(targets: string[], active_target: string) {
  useAppStore.setState({
    config: { ...useAppStore.getState().config, translation: { targets, active_target } },
  })
  return render(<TranslatePillLanguage />)
}

describe('translatePillFor', () => {
  const name = (code: string) => code.toUpperCase()
  const measure = (text: string) => text.length * 10

  it('names the active language and gives one dot per language from two up', () => {
    expect(translatePillFor(['en', 'ja', 'fr'], 'ja', name, measure)).toEqual({
      codes: ['en', 'ja', 'fr'],
      activeIndex: 1,
      name: 'JA',
      nameWidth: 20,
      dots: 3,
    })
    expect(translatePillFor(['en', 'ja'], 'en', name, measure).dots).toBe(2)
  })

  it('shows one language by name only, and no name without a language', () => {
    expect(translatePillFor(['ja'], 'ja', name, measure)).toMatchObject({ name: 'JA', dots: 0 })
    expect(translatePillFor([], 'en', name, measure)).toEqual({
      codes: [],
      activeIndex: 0,
      name: null,
      nameWidth: null,
      dots: 0,
    })
  })

  it('falls back to the first language when the active one is not in the list', () => {
    expect(translatePillFor(['fr', 'de'], 'en', name, measure)).toMatchObject({
      activeIndex: 0,
      name: 'FR',
    })
  })
})

describe('marquee decision', () => {
  it('scrolls only names wider than the 180 pt limit, by their natural width', () => {
    expect(nameDisplay(120, false)).toBe('full')
    expect(nameDisplay(180, false)).toBe('full')
    expect(nameDisplay(180.5, false)).toBe('marquee')
    expect(nameDisplay(400, false)).toBe('marquee')
  })

  it('cuts a long name with an ellipsis instead of scrolling under Reduce Motion', () => {
    expect(nameDisplay(400, true)).toBe('ellipsis')
    expect(nameDisplay(120, true)).toBe('full')
  })

  it('moves one copy plus the gap at about 28 pt per second', () => {
    expect(MARQUEE_SPEED).toBe(28)
    expect(marqueeDurationSeconds(252)).toBeCloseTo((252 + MARQUEE_GAP) / 28)
    expect(marqueeDurationSeconds(251.3)).toBeCloseTo(10)
  })
})

describe('TranslatePillLanguage', () => {
  it('shows a short name in full at its natural width', () => {
    widths.set('English', 44.4)
    showLanguages(['en', 'ja'], 'en')

    const name = screen.getByTestId('translate-pill-name')
    expect(name).toHaveTextContent('English')
    expect(name).toHaveAttribute('data-display', 'full')
    expect(name.style.width).toBe('45px')
    expect(name.querySelector('.pill-lang-marquee-track')).toBeNull()
    expect(screen.getByTestId('translate-pill-dots').querySelectorAll('i')).toHaveLength(2)
  })

  it('scrolls a name wider than 180 pt as two copies inside the 180 pt area', () => {
    widths.set('translate.languages.zhHantHK', 252)
    showLanguages(['zh-Hant-HK'], 'zh-Hant-HK')

    const name = screen.getByTestId('translate-pill-name')
    expect(name).toHaveAttribute('data-display', 'marquee')
    expect(name).toHaveClass('pill-lang-marquee')
    expect(name.style.width).toBe('180px')
    expect(name.style.getPropertyValue('--pill-marquee-duration')).toBe('10.00s')
    const copies = name.querySelectorAll('.pill-lang-marquee-track > span')
    expect(Array.from(copies, (copy) => copy.textContent)).toEqual([
      'translate.languages.zhHantHK',
      'translate.languages.zhHantHK',
    ])
    // The copies are decoration; the name is announced once, from the label.
    expect(name).toHaveAttribute(
      'aria-label',
      'translate.pillLanguage {"language":"translate.languages.zhHantHK"}',
    )
    expect(screen.queryByTestId('translate-pill-dots')).toBeNull()
  })

  it('does not scroll under Reduce Motion: the name is cut with an ellipsis', () => {
    motion.reduced = true
    widths.set('translate.languages.zhHantHK', 252)
    showLanguages(['zh-Hant-HK', 'en'], 'zh-Hant-HK')

    const name = screen.getByTestId('translate-pill-name')
    expect(name).toHaveAttribute('data-display', 'ellipsis')
    expect(name).not.toHaveClass('pill-lang-marquee')
    expect(name.style.width).toBe('180px')
    expect(name.querySelector('.pill-lang-marquee-track')).toBeNull()
    expect(name).toHaveTextContent('translate.languages.zhHantHK')
  })

  it('shows nothing without a language', () => {
    const { container } = showLanguages([], 'en')
    expect(container).toBeEmptyDOMElement()
  })
})
