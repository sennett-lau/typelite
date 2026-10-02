import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['benchmarks/recording.test.tsx'],
    setupFiles: ['src/test-setup.ts'],
    maxWorkers: 1,
    testTimeout: 60_000,
  },
})
