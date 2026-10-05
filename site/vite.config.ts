import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served at the root of https://typelite.sennettlau.me/ (a custom domain on GitHub Pages).
export default defineConfig({
  base: '/',
  plugins: [react()],
  // The language section reads the preset library from ../presets/languages/index.json.
  server: { fs: { allow: ['..'] } },
  build: {
    target: 'es2020',
    // Only the site itself. The pages under capture/ are for scripts/capture-media.mjs and are
    // never part of the published build.
    rollupOptions: { input: 'index.html' },
  },
})
