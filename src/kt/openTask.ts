// Opening a card from the table hands off to Kanban Tool's own task view rather than
// reimplementing it - description, comments, attachments, checklists and time tracking
// all already live there, and duplicating them would be a second thing to keep correct.
//
// The card opens *over* the table: the table stays mounted and drops below the layer
// the host paints the task view in, so closing the card puts the user back in the table
// rather than on the board. Nothing here hard-codes how high the host's layers are -
// the depth is measured from the task view element once it exists - and every step that
// can fail falls back to what this used to do unconditionally: take the table down and
// show the board, which is always a working way to see a card.
//
// The SDK documents `<kt-task>` and `<kt-taskview>` as custom elements and
// `kt-taskview:open` as an event, but it exposes no documented "open this task" call.
// So we click the card's own element, which is what a user would do.
//
// Confirmed on the pilot board: the open card is a `<kt-taskview>` that the host
// renders inside the board, and closing it HIDES that element rather than removing it.
//
// The board therefore stays hidden while a card is open, and the card is brought back
// on its own with `visibility: visible` - the one hiding switch a descendant can
// override. Revealing the board instead, which would make hiding unambiguous, does not
// work: the table has to drop below the stacking context the task view sits in, which
// is the board's own, so a revealed board paints over the table and the user is looking
// at the board again. That was tried, and is what this comment is for.
//
// What that costs is one blind spot, named here so it is not rediscovered: while the
// board is hidden, `visibility: hidden` inherited from it says nothing about the host's
// intent, so a card closed by a *class* that sets `visibility` reads as still open. The
// signals that do work are the element going away, `display: none` from anywhere, the
// host writing over the inline `visibility` we set, and a rect that has gone.
//
// CONFIRM ON THE PILOT BOARD: the attribute `<kt-task>` carries its task id in - the
// candidates in ID_ATTRIBUTES cover the usual shapes; replace them with the real one
// once known.

import { log, notify, warn } from './env'
import { BOARD_ELEMENT, NAVBAR_SELECTOR } from './selectors'

const ID_ATTRIBUTES = ['data-id', 'data-task-id', 'task-id', 'id'] as const

/** Documented custom element wrapping the host's own task view. */
const TASKVIEW_ELEMENT = 'kt-taskview'

/**
 * An open card is not one element. On the board, the activity list and its comment box
 * are in a side panel beside the task view, so "open the card over the table" has to
 * bring every surface the host shows, not just `<kt-taskview>`.
 *
 * CONFIRM ON THE PILOT BOARD: which of these is the activity panel - run
 * `KTTableView.probeCard()` with a card open and replace the list with what it names.
 * A candidate that matches nothing costs nothing: the task view alone is layered, as
 * before. Every match is logged, so a wrong one says its own name in the console.
 */
const PANEL_CANDIDATES = [
  '[id*="side_panel"]',
  '[class*="side_panel"]',
  '[id*="side-panel"]',
  '[class*="side-panel"]',
  '[id*="task_view"]',
  '[class*="task_view"]',
] as const

/** Below this, a panel is a sliver or a collapsed shell rather than something shown. */
const MIN_PANEL_PX = 20

/** How long the task view gets to appear after the card is clicked. */
const APPEAR_TIMEOUT_MS = 2000

/** Backstop for a task view that is hidden rather than removed when the user closes it. */
const POLL_MS = 250

/**
 * What the table can do about its own layering. Implemented by the overlay, which owns
 * the container; this file only decides when.
 */
export interface TableLayer {
  /** Drop the table to `zIndex`, so the task view paints over it. */
  sendBehind(zIndex: number): void
  /** Put the table back on top. */
  bringForward(): void
  /** Take the table down and reveal the board. The fallback, and always available. */
  showBoard(): void
  /** True when the element is part of the table itself rather than the host's page. */
  owns(element: Element): boolean
  /** True when the table is the topmost thing painted at this viewport point. */
  isCoveringPoint(x: number, y: number): boolean
}

interface OpenState {
  taskview: HTMLElement
  layer: TableLayer
  /** Every surface of the open card, against how to put it back as it was. */
  surfaces: Map<HTMLElement, (() => void) | null>
  /** The depth the table currently sits at: below every surface. */
  depth: number
  stopWatching: () => void
}

let current: OpenState | null = null

/**
 * Bumped by every open and every close, so the wait for a task view can tell that the
 * user has moved on - clicked another card, or closed the table - and drop what it was
 * about to do to a table that is no longer the one it started against.
 */
let generation = 0

/** When the last card closed, on the same clock as an event's `timeStamp`. */
let closedAt = 0

interface TaskMatch {
  element: HTMLElement
  /** Which of ID_ATTRIBUTES matched - worth logging, since only one of them is real. */
  attribute: string
}

function findTaskMatch(taskId: number, root: ParentNode = document): TaskMatch | null {
  for (const attribute of ID_ATTRIBUTES) {
    const selector =
      attribute === 'id'
        ? `kt-task#task_${taskId}, kt-task#task-${taskId}`
        : `kt-task[${attribute}="${taskId}"]`
    const element = root.querySelector<HTMLElement>(selector)
    if (element) return { element, attribute }
  }
  return null
}

export function findTaskElement(taskId: number, root: ParentNode = document): HTMLElement | null {
  return findTaskMatch(taskId, root)?.element ?? null
}

/** True while a card is open over the table. */
export function isTaskOpen(): boolean {
  return current !== null
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now()
}

/**
 * Whether Escape belongs to the card rather than to the table, for a keystroke that
 * began at `eventTime` (an event's `timeStamp`, same clock as `performance.now()`).
 *
 * The second half of this is not belt and braces. The host closes its task view on the
 * same keystroke we are deciding about, and the mutation that tells us so is delivered
 * between two listeners for that one event - so by the time this is asked, the card can
 * already be recorded as closed. A card that closed *after* the keystroke began closed
 * because of it, and the table is not the next thing that Escape should take away.
 */
export function taskViewOwnsEscape(eventTime: number): boolean {
  if (current) return true
  return closedAt > 0 && eventTime > 0 && closedAt >= eventTime
}

/**
 * Whether the host is still showing this task view.
 *
 * Closing a card hides this element rather than removing it, so this is a question
 * about styles, and two of them are ours rather than the host's. `visibility: hidden`
 * inherited from the board we hide is not evidence (see the note at the top of this
 * file), and neither is a zero-sized rect on an element that never had one - that means
 * "nothing is laid out here" in a test environment as often as it means hidden.
 *
 * `forced` says we wrote `visibility: visible` onto the element. The host writing its
 * own value over ours is then the clearest signal of all that it has closed the card.
 */
function isShowing(element: HTMLElement, hadLayout: boolean, forced = false): boolean {
  if (!element.isConnected) return false
  if (forced && element.style.visibility !== 'visible') return false
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(element)
    if (style.display === 'none') return false
    if (style.visibility === 'hidden' && !hasHiddenAncestor(element)) return false
  }
  if (hadLayout && !hasLayout(element)) return false
  return true
}

function hasHiddenAncestor(element: HTMLElement): boolean {
  if (typeof getComputedStyle !== 'function') return false
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).visibility === 'hidden') return true
  }
  return false
}

function hasLayout(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function findTaskViewElement(root: ParentNode = document): HTMLElement | null {
  const elements = [...root.querySelectorAll<HTMLElement>(TASKVIEW_ELEMENT)]
  return elements.find((element) => isShowing(element, false)) ?? null
}

/**
 * The surfaces of the open card other than the task view itself - in practice the side
 * panel holding the activity list and the comment box.
 *
 * Everything here is a filter against picking up the page instead of the card: a
 * candidate has to be on screen with a real size, has to not be one of ours, has to not
 * wrap the whole board (page-level shells match `[class*="panel"]` on plenty of apps),
 * has to not be page chrome - the navbar's own `top-right-pane` carries the class
 * `kt-side-panel-slide` on a real board, and was the first thing these candidates
 * found - and has to not already be part of the task view or an ancestor of it, which
 * the task view's own measurement covers.
 */
function findPanels(taskview: HTMLElement, layer: TableLayer): HTMLElement[] {
  const board = document.querySelector(BOARD_ELEMENT)
  const navbar = document.querySelector(NAVBAR_SELECTOR)
  const found: HTMLElement[] = []

  for (const selector of PANEL_CANDIDATES) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (found.includes(element)) continue
      if (element === taskview || element.contains(taskview) || taskview.contains(element)) continue
      if (layer.owns(element)) continue
      if (board && element.contains(board)) continue
      if (navbar && (navbar.contains(element) || element.contains(navbar))) continue
      if (!isShowing(element, false)) continue
      // A measured sliver is a collapsed shell, not a panel. A rect of nothing at all
      // is no measurement - the same reading of a zero rect as everywhere else here.
      const rect = element.getBoundingClientRect()
      const measured = rect.width > 0 && rect.height > 0
      if (measured && (rect.width < MIN_PANEL_PX || rect.height < MIN_PANEL_PX)) continue
      found.push(element)
    }
  }
  return found
}

/**
 * The z-index the table has to drop below for `element` to paint over it.
 *
 * What competes with our container is not the element's own z-index but that of the
 * outermost positioned ancestor carrying one - a child cannot escape the stacking
 * context its parent establishes - so the walk keeps the last value it finds, not the
 * first. `null` means nothing in the chain is layered at all.
 */
export function stackingZIndex(element: HTMLElement): number | null {
  if (typeof getComputedStyle !== 'function') return null
  let found: number | null = null
  let node: HTMLElement | null = element
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const value = Number.parseInt(style.zIndex, 10)
    if (!Number.isNaN(value) && style.position !== 'static') found = value
    node = node.parentElement
  }
  return found
}

/** Where to put the table so `taskview` is above it and the board still below it. */
export function behindZIndex(taskview: HTMLElement): number {
  const above = stackingZIndex(taskview)
  // Nothing layered: the task view paints by document order, and our container was
  // added to <body> before it, so we only need to stop out-ranking it.
  if (above === null) return 0
  return Math.max(0, above - 1)
}

/**
 * Brings the task view back on its own while the board it lives in stays hidden.
 * `visibility` is the one hiding switch a descendant can override, which is exactly why
 * the overlay hides the board with it. Returns null when nothing was hiding the element
 * and there is therefore nothing to undo.
 */
function forceVisible(element: HTMLElement): (() => void) | null {
  if (!hasHiddenAncestor(element)) return null

  const previous = element.style.visibility
  element.style.visibility = 'visible'
  return () => {
    element.style.visibility = previous
  }
}

function waitForTaskView(): Promise<HTMLElement | null> {
  const existing = findTaskViewElement()
  if (existing) return Promise.resolve(existing)
  if (typeof MutationObserver !== 'function') return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const finish = (element: HTMLElement | null): void => {
      if (settled) return
      settled = true
      observer.disconnect()
      clearTimeout(timer)
      resolve(element)
    }
    const observer = new MutationObserver(() => {
      const element = findTaskViewElement()
      if (element) finish(element)
    })
    // Attributes as well as insertions: the host may keep a task view in the page and
    // reveal it with a class or a style when a card is opened, which is not a change to
    // the tree at all. The callback is a single querySelectorAll on a tag name, and the
    // observer only lives for as long as one card takes to open.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    })
    const timer = setTimeout(() => finish(findTaskViewElement()), APPEAR_TIMEOUT_MS)
  })
}

/**
 * Closing a card is the host's business, and it may do it by removing the element or by
 * hiding it. Watch for both: mutations catch it at once, the interval catches whatever
 * shape of hiding mutations do not describe.
 */
function watchOpenCard(state: OpenState, onClosed: () => void): () => void {
  const taskview = state.taskview
  const hadLayout = hasLayout(taskview)
  const forced = state.surfaces.get(taskview) != null
  let stopped = false

  const check = (): void => {
    if (stopped) return
    if (!isShowing(taskview, hadLayout, forced)) {
      onClosed()
      return
    }
    // The card is still open: it may have grown a panel since we last looked.
    syncSurfaces(state)
  }

  const timer = setInterval(check, POLL_MS)
  let observer: MutationObserver | null = null
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    observer.observe(taskview, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] })
  }

  return () => {
    stopped = true
    clearInterval(timer)
    observer?.disconnect()
  }
}

/**
 * Takes in any surface of the card that was not there when it opened - the activity
 * panel can arrive a moment after the card does - and drops the table below it. Runs on
 * the same beat as the watch for the card closing, so a late panel costs one tick.
 */
function syncSurfaces(state: OpenState): void {
  let depth = state.depth
  for (const panel of findPanels(state.taskview, state.layer)) {
    if (state.surfaces.has(panel)) continue
    log('card surface:', panel)
    state.surfaces.set(panel, forceVisible(panel))
    depth = Math.min(depth, behindZIndex(panel))
  }
  if (depth !== state.depth) {
    state.depth = depth
    state.layer.sendBehind(depth)
  }
}

/** Undoes everything openTask() did to the page. Safe to call when nothing is open. */
export function closeTaskView(): void {
  generation += 1
  if (!current) return
  const state = current
  current = null
  closedAt = now()
  state.stopWatching()
  for (const restore of state.surfaces.values()) restore?.()
  state.layer.bringForward()
}

/**
 * Layers the card over the table once the host has rendered it. Returns false when we
 * could not get it above the table, having already put the user on the board instead.
 */
function layerOver(taskview: HTMLElement, layer: TableLayer): boolean {
  const surfaces = new Map<HTMLElement, (() => void) | null>()
  surfaces.set(taskview, forceVisible(taskview))
  layer.sendBehind(behindZIndex(taskview))

  const rect = taskview.getBoundingClientRect()
  const laidOut = rect.width > 0 && rect.height > 0
  if (
    laidOut &&
    layer.isCoveringPoint(Math.round(rect.left + rect.width / 2), Math.round(rect.top + rect.height / 2))
  ) {
    // The host paints its task view below where we can put the table, so "over the
    // table" is not available on this page. Say so, and do what we always did.
    warn('the task view paints below the table; falling back to showing the board')
    for (const restore of surfaces.values()) restore?.()
    layer.bringForward()
    layer.showBoard()
    notify('Opened on the board', 'This card cannot be shown over the table.')
    return false
  }

  const state: OpenState = {
    taskview,
    layer,
    surfaces,
    depth: behindZIndex(taskview),
    stopWatching: () => undefined,
  }
  // The panel the activity list lives in is often a sibling of the task view rather
  // than part of it, and may arrive a moment later; this picks up whatever is there
  // now, and the watch keeps looking.
  syncSurfaces(state)
  state.stopWatching = watchOpenCard(state, closeTaskView)
  current = state
  return true
}

/**
 * Every `<kt-taskview>` on the page and why it was not taken as the open card. Printed
 * when the wait fails, so the console says which assumption was wrong without anyone
 * having to reproduce it with `KTTableView.inspect()` open.
 */
function describeTaskViews(): string {
  const elements = [...document.querySelectorAll<HTMLElement>(TASKVIEW_ELEMENT)]
  if (elements.length === 0) return `no <${TASKVIEW_ELEMENT}> in the page at all`
  return elements
    .map((element, index) => {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null
      const rect = element.getBoundingClientRect()
      return (
        `[${index}] display: ${style?.display}, visibility: ${style?.visibility},` +
        ` hidden ancestor: ${hasHiddenAncestor(element)}, rect: ${Math.round(rect.width)}x${Math.round(rect.height)}`
      )
    })
    .join(' | ')
}

/**
 * Opens a card over the table. Resolves true when it ended up there; on false the user
 * has already been told what happened, and is looking at the board.
 */
export function openTask(taskId: number, layer: TableLayer): Promise<boolean> {
  // A card already open is the one the user is looking at; put it away first.
  closeTaskView()
  const ticket = generation

  const match = findTaskMatch(taskId)
  if (!match) {
    // Nothing to click. The board is a working way to reach the card and the table is
    // not, so step aside rather than leave an error over a table that cannot help.
    layer.showBoard()
    warn('could not locate the card element for task', taskId)
    notify('Card not on screen', 'Open the card from the board - it may be in a collapsed or filtered column.')
    return Promise.resolve(false)
  }

  log(`opening task ${taskId}: <kt-task> matched on ${match.attribute}`)
  match.element.click()

  return waitForTaskView().then((taskview) => {
    // Another card, or the table closing, happened while we waited.
    if (ticket !== generation) return false
    if (!taskview) {
      warn(`no task view appeared for task ${taskId}`, describeTaskViews())
      layer.showBoard()
      notify('Opened on the board', 'The card did not open over the table.')
      return false
    }
    return layerOver(taskview, layer)
  })
}
