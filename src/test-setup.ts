import '@testing-library/jest-dom/vitest'

/**
 * Node 25 and later have their own `localStorage` global (Web Storage). Without
 * `--localstorage-file` it has no working methods (or throws on access), and it hides jsdom's
 * storage, so modules that read `localStorage` on import (`i18n/index.ts`) fail to load. Tests
 * get a plain in-memory Storage instead whenever the global one does not work.
 */
function workingStorage(): boolean {
  try {
    return typeof globalThis.localStorage?.getItem === 'function'
  } catch {
    return false
  }
}

class MemoryStorage implements Storage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  clear() {
    this.items.clear()
  }
  getItem(key: string) {
    return this.items.get(key) ?? null
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.items.delete(key)
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value))
  }
}

if (!workingStorage()) {
  const storage = new MemoryStorage()
  for (const target of new Set<object>([globalThis, window])) {
    Object.defineProperty(target, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    })
  }
}
