// Entry of the app capture page. The Tauri mocks must be installed before any app module runs,
// so everything from ../../src is imported dynamically afterwards.
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import { handleCommand, SCREENS, type Screen } from './mocks'

// Keep warnings and errors so the capture script can print them.
const logs: string[] = []
;(window as unknown as { __captureLogs: string[] }).__captureLogs = logs
for (const level of ['warn', 'error'] as const) {
  const original = console[level].bind(console)
  console[level] = (...args: unknown[]) => {
    logs.push(
      `${level}: ${args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`,
    )
    original(...args)
  }
}
window.addEventListener('error', (e) => logs.push(`error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) => logs.push(`rejection: ${String(e.reason)}`))

const params = new URLSearchParams(window.location.search)
const requested = params.get('screen') as Screen | null
const screen: Screen = requested && requested in SCREENS ? requested : 'home'
const dark = params.get('theme') === 'dark'

document.documentElement.classList.toggle('dark', dark)
document.documentElement.dataset.screen = screen
document.documentElement.dataset.theme = dark ? 'dark' : 'light'

// The app picks its window (main or capsule) and page from the URL hash.
history.replaceState(
  null,
  '',
  `${window.location.pathname}${window.location.search}${SCREENS[screen].hash}`,
)
localStorage.setItem('ui_language', 'en')

mockWindows(screen === 'copy-pill' ? 'capsule' : 'main')
mockIPC((cmd, args) => handleCommand(screen, dark, cmd, args as Record<string, unknown>), {
  shouldMockEvents: true,
})

void import('./app').then(({ mount }) => mount(screen))
