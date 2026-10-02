import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('release version wiring', () => {
  it.each(['v9.8.7', 'v9.8.8-beta.1'])('exposes the injected build version %s', async (version) => {
    vi.stubEnv('VITE_APP_VERSION', version)
    vi.resetModules()

    const { APP_VERSION } = await import('../constants')

    expect(APP_VERSION).toBe(version)
  })
})
