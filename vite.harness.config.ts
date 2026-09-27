import { defineConfig } from 'vite'

// Dev-only: serves harness/index.html, which installs the fake KT globals and then
// loads the real extension. Nothing here affects the shipped bundle (vite.config.ts).
export default defineConfig({
  root: 'harness',
  server: {
    port: 5180,
    // main.ts imports from ../src and ../test, which sit outside the harness root.
    fs: { allow: ['..'] },
  },
})
