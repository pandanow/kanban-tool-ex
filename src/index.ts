// Entry point.
//
// Loaded as a plain <script> on Kanban Tool board pages - either registered account-wide
// (Account Administration > Account settings, developer pane) or pasted into a single
// board's Developer Tools power-up during the pilot. Both give us the same thing: this
// file runs inside the user's authenticated session, so there is no API token anywhere.
//
// Shape follows the SDK's documented custom-script idiom: an IIFE (the build emits one),
// CSS appended to <head>, and everything else deferred to KT.onInit.

import css from './ui/styles.css?inline'
import { getKT, log, warn } from './kt/env'
import { runSelfCheck } from './kt/selectors'
import { close, toggle } from './ui/overlay'
import { inspect, installLauncher, probeCard } from './ui/launcher'

const STYLE_ID = 'ktv-styles'

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = css
  document.head.appendChild(style)
}

function start(): void {
  injectStyles()

  const check = runSelfCheck()
  if (!check.boardFound) {
    // Not a board page (or the custom element changed name). Either way, do nothing
    // rather than push a broken button into someone's account.
    log('no board on this page; table view is idle')
    return
  }
  if (!check.toolbarFound) {
    log('no board-header mount point matched; showing a floating Table button instead')
  }

  installLauncher()
}

const kt = getKT()
if (kt) {
  kt.onInit(start, (err) => warn('KT failed to initialise; table view not started', err))
} else {
  // The script can land on non-board pages of the account, where KT is absent.
  log('KT global not present on this page; table view not started')
}

// A small handle for debugging from the console during the pilot.
window.KTTableView = { toggle, close, runSelfCheck, inspect, probeCard }
