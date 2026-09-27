// Access to the host page globals. Everything else imports from here rather than
// touching `window`, so tests can run without a Kanban Tool page around them.

import type { JQueryStatic, KTGlobal } from './types'

export function getKT(): KTGlobal | undefined {
  return typeof window === 'undefined' ? undefined : window.KT
}

export function requireKT(): KTGlobal {
  const kt = getKT()
  if (!kt) throw new Error('[kt-table-view] KT global is not available on this page')
  return kt
}

export function getJQuery(): JQueryStatic | undefined {
  if (typeof window === 'undefined') return undefined
  return window.jQuery ?? window.$
}

declare const __KTV_BUILD__: string | undefined

/**
 * Which build this is, stamped in by vite.config.ts. Printed at startup and by
 * `inspect()`, because a board can quietly keep serving an older bundle when saving a
 * new one fails - and then every symptom is the old build's, not the new one's.
 */
export const BUILD: string = typeof __KTV_BUILD__ === 'string' ? __KTV_BUILD__ : 'dev'

export const LOG_PREFIX = '[kt-table-view]'

export function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

export function warn(...args: unknown[]): void {
  console.warn(LOG_PREFIX, ...args)
}

/**
 * Toast helpers. These degrade to the console when KT is absent (e.g. the script is
 * loaded on a non-board page) rather than throwing into the host app.
 */
export function notify(title: string, message?: string): void {
  const kt = getKT()
  if (kt) kt.notice(title, message)
  else log(title, message ?? '')
}

export function notifyError(title: string, message?: string): void {
  const kt = getKT()
  if (kt) kt.error(title, message)
  else warn(title, message ?? '')
}
