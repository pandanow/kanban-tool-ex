// EVERY selector that reaches into Kanban Tool's own DOM lives here.
//
// The SDK has no official "custom view" extension point, so mounting a full-board
// alternate rendering means touching markup Kanban Tool does not treat as a public
// contract. Confining that to one file means a UI change upstream is a one-file fix,
// and `runSelfCheck()` tells us at load time when a selector has gone stale instead of
// letting the extension half-work.
//
// `kt-board` is a documented custom element and is the only selector we consider
// load-bearing. Toolbar selectors are best-effort candidate lists: when none match we
// simply do not render the toolbar button, and the documented board context-menu entry
// remains the way in.

export interface SelfCheckResult {
  ok: boolean
  /** The board element was found - without it there is nothing to overlay. */
  boardFound: boolean
  /** A toolbar mount point was found - if not, fall back to the context menu only. */
  toolbarFound: boolean
  missing: string[]
}

/** Documented custom element wrapping the whole board rendering. */
export const BOARD_ELEMENT = 'kt-board'

/** Documented custom elements, used for scoping and for the pilot-board probe. */
export const KT_ELEMENTS = ['kt-board', 'kt-tasklist', 'kt-task', 'kt-taskview'] as const

/**
 * Candidate mount points for the "Table" button, most specific first.
 *
 * Findings from a real board: there is no board-level header at all. The only page
 * chrome is a Bootstrap 2.3.2 `nav.navbar`; everything else matching /header/ is
 * per-column (`.kt-tasklist-header`) or per-card (`.kt-task-header`) and would put a
 * button on every card.
 *
 * `._links` is the board-level link group - Share, Settings, Help - which is where a
 * view switcher belongs, and its anchors are styled by the host page so the button
 * looks native. The broader selectors are fallbacks for a differently built navbar; if
 * none match, the launcher floats the button instead.
 */
export const TOOLBAR_CANDIDATES = [
  '.navbar .navbar-inner .top-right-pane ._links',
  '.navbar .navbar-inner .top-right-pane',
  '.navbar .navbar-inner',
] as const

export function findBoardElement(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(BOARD_ELEMENT)
}

export function findToolbarElement(root: ParentNode = document): HTMLElement | null {
  for (const selector of TOOLBAR_CANDIDATES) {
    const el = root.querySelector<HTMLElement>(selector)
    if (el) return el
  }
  return null
}

export function runSelfCheck(root: ParentNode = document): SelfCheckResult {
  const boardFound = findBoardElement(root) !== null
  const toolbarFound = findToolbarElement(root) !== null
  const missing: string[] = []
  if (!boardFound) missing.push(BOARD_ELEMENT)
  if (!toolbarFound) missing.push(`toolbar (tried: ${TOOLBAR_CANDIDATES.join(', ')})`)
  return { ok: boardFound, boardFound, toolbarFound, missing }
}
