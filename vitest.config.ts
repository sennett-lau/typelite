import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    maxWorkers: 4,
    setupFiles: ['src/test-setup.ts'],
    // Plan `ask-panel-select-text`: a test reads globals.css (?raw) to check selectable styles.
    css: { include: [/globals\.css/] },
  },
})
