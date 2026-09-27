import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// Stamped into the bundle and printed at startup. A board's Developer Tools box can
// fail to save (it has answered 500) and then goes on serving the previous script, with
// nothing on the page to say so - the stamp is what tells you which build you are
// actually looking at before you debug the wrong one.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
const BUILD = `${version}+${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`

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
  define: { __KTV_BUILD__: JSON.stringify(BUILD) },
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
