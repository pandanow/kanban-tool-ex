import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: that file describes the shipped IIFE bundle, this
// one describes how the code is exercised. The DOM environment is only needed by the
// integration tests; the model tests run in it harmlessly.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
