import { describe, expect, it } from 'vitest'
import packageJson from '../../../package.json'
import tauriConfig from '../../../src-tauri/tauri.conf.json'
import { APP_VERSION } from '../constants'

describe('app version', () => {
  it('comes from package.json, the one place it is set', () => {
    expect(APP_VERSION).toBe(packageJson.version)
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('is what Tauri builds the app with', () => {
    expect(tauriConfig.version).toBe('../package.json')
  })
})
