import { defineConfig } from 'vite'

// The bundle is loaded into Kanban Tool board pages as a plain <script> (account-wide
// external script, or pasted into a board's Developer Tools power-up). That means:
//   - IIFE format, no module syntax, no imports at runtime
//   - everything bundled, including Preact - the host page provides only
//     jQuery/Backbone/Underscore/Bootstrap 2.3.2, which we deliberately do not rely on
//   - CSS is imported with ?inline and injected by src/index.ts, so a single JS URL is
//     the whole deliverable and the pilot bootstrap ($.getScript) works unchanged
//
// JSX is configured in tsconfig.json (jsx: react-jsx, jsxImportSource: preact) and
// picked up from there by the transform - there is no separate JSX config here.
export default defineConfig({
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    sourcemap: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['iife'],
      name: 'KTTableView',
      fileName: () => 'kt-table-view.js',
    },
  },
})
