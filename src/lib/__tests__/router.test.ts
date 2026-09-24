import { afterEach, describe, expect, it } from 'vitest'
import { parseHash, settingsPaneHash } from '../router'

afterEach(() => {
  window.location.hash = ''
})

describe('desktop route parsing', () => {
  it('keeps direct recovery links inside Settings', () => {
    window.location.hash = '#/settings?pane=stt'
    expect(parseHash()).toBe('settings')
    window.location.hash = '#/settings?pane=llm'
    expect(parseHash()).toBe('settings')
  })

  it('routes the Dictionary tab and the About page', () => {
    window.location.hash = '#/dictionary'
    expect(parseHash()).toBe('dictionary')
    window.location.hash = '#/about'
    expect(parseHash()).toBe('about')
  })

  it('sends the removed History route to Home', () => {
    window.location.hash = '#/history'
    expect(parseHash()).toBe('home')
    window.location.hash = '#/'
    expect(parseHash()).toBe('home')
  })

  it('builds links to a Settings section', () => {
    expect(settingsPaneHash('general')).toBe('#/settings?pane=general')
  })
})
