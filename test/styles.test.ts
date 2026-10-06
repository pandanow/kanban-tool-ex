import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// These assertions look pedantic, but each one encodes a failure seen on a real board
// where the table mounted correctly and simply was not painted. Losing any of them
// brings back a blank screen that looks like a data bug.

// import.meta.url is not a file: URL under the happy-dom environment, so resolve from
// the project root instead.
const css = readFileSync(resolve(process.cwd(), 'src/ui/styles.css'), 'utf8')
const rootRule = css.slice(css.indexOf('.ktv-root {'), css.indexOf('}', css.indexOf('.ktv-root {')))

describe('the overlay stylesheet', () => {
  it.each([
    ['visibility', 'the custom-theme extension hides unrecognised <body> children'],
    ['display', 'the same rule can hide us with display'],
    ['position', 'a static overlay would sit in page flow'],
    ['opacity', 'a host rule could fade us out'],
    ['z-index', 'the host page paints its own layers high'],
  ])('keeps %s !important - %s', (property) => {
    const declaration = rootRule
      .split('\n')
      .find((line) => line.trim().startsWith(`${property}:`))
    expect(declaration, `${property} missing from .ktv-root`).toBeDefined()
    expect(declaration).toContain('!important')
  })

  it('forces descendants visible too, in case the host rule is a descendant selector', () => {
    expect(css).toMatch(/\.ktv-root \*\s*\{[^}]*visibility:\s*visible\s*!important/)
  })

  it('scopes every rule, so nothing leaks into the host page', () => {
    const selectors = [...css.matchAll(/^([^@\s][^{]*)\{/gm)].map((m) => (m[1] ?? '').trim())
    const unscoped = selectors.filter(
      (selector) =>
        !selector.includes('.ktv-') &&
        !selector.startsWith('body.ktv-open') &&
        selector !== 'kt-task .kt-task-body', // board card title size, on purpose
    )
    expect(unscoped).toEqual([])
  })
})
