// Mounts the table over the board and takes it down again cleanly.
//
// Geometry, learned the hard way on a real board. Two facts drive all of it:
//
//   * hiding the board with `display: none` collapses its parent, so an overlay sized
//     `absolute; inset: 0` inside that parent came out 0x0 - an empty page;
//   * `<kt-board>` is the scroll *content*, not a viewport-sized pane. On a real board
//     it measures 2245 x 14708px. Sizing the overlay to that rect put almost all of the
//     table past the edge of the screen, unreachable.
//
// So: the board is hidden with `visibility: hidden` (it keeps its box, and stays
// measurable), and the overlay is `position: fixed`, anchored to where the board
// *starts* but clamped to the viewport - it covers the screen from just under the
// navbar to the bottom, and scrolls internally. Page scrolling is locked while it is
// up, since the page behind it would otherwise slide around under a fixed panel.
//
// The board itself is never modified beyond that one style, and teardown restores the
// exact inline value it found. The worst case must be "the board is still there".

import { h, render } from 'preact'
import { log, notifyError, warn } from '../kt/env'
import { loadCurrentBoard } from '../kt/currentBoard'
import { findBoardElement } from '../kt/selectors'
import { BoardStore } from '../kt/store'
import { TableView } from './TableView'

/** Set on <body> while the table is up, so the floating launcher can hide itself. */
const OPEN_BODY_CLASS = 'ktv-open'

/** Below this, a measured rect is treated as unusable and we fill the viewport. */
const MIN_USABLE_PX = 80

interface MountedState {
  container: HTMLElement
  board: HTMLElement
  previousVisibility: string
  restoreScrolling: () => void
  store: BoardStore
  stopTracking: () => void
}

let mounted: MountedState | null = null
let opening = false

export function isOpen(): boolean {
  return mounted !== null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Covers the screen from where the board begins down to the bottom of the viewport.
 *
 * The board's rect gives us the top edge (below the navbar) and nothing else worth
 * having: its width and height describe scrollable content far larger than the screen.
 * Anything degenerate falls back to the full viewport rather than collapsing.
 */
export function viewportBox(
  rect: { top: number; left: number },
  viewport: { width: number; height: number },
): { top: number; left: number; width: number; height: number } {
  const top = clamp(rect.top, 0, viewport.height)
  const left = clamp(rect.left, 0, viewport.width)
  const box = {
    top,
    left,
    width: viewport.width - left,
    height: viewport.height - top,
  }
  if (box.width < MIN_USABLE_PX || box.height < MIN_USABLE_PX) {
    return { top: 0, left: 0, width: viewport.width, height: viewport.height }
  }
  return box
}

function positionOver(container: HTMLElement, board: HTMLElement): void {
  const rect = board.getBoundingClientRect()
  const viewport = {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  }

  if (viewport.width < MIN_USABLE_PX || viewport.height < MIN_USABLE_PX) {
    // No measurable viewport (happens in test environments). Fill whatever there is.
    container.style.top = '0'
    container.style.left = '0'
    container.style.width = '100%'
    container.style.height = '100%'
    return
  }

  const box = viewportBox(rect, viewport)
  container.style.top = `${box.top}px`
  container.style.left = `${box.left}px`
  container.style.width = `${box.width}px`
  container.style.height = `${box.height}px`
}

/**
 * The board's own 14708px of content still sits behind the overlay, so without this the
 * page scrolls under a panel that does not move with it.
 */
function lockPageScrolling(): () => void {
  const root = document.documentElement
  const previousRoot = root.style.overflow
  const previousBody = document.body.style.overflow
  root.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  return () => {
    root.style.overflow = previousRoot
    document.body.style.overflow = previousBody
  }
}

/** Keeps the overlay aligned with the board as the window changes around it. */
function trackBoard(container: HTMLElement, board: HTMLElement): () => void {
  const reposition = (): void => positionOver(container, board)

  window.addEventListener('resize', reposition)
  window.addEventListener('scroll', reposition, true)

  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(reposition)
    observer.observe(board)
  }

  return () => {
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, true)
    observer?.disconnect()
  }
}

export function close(): void {
  if (!mounted) return
  const state = mounted
  mounted = null
  document.body.classList.remove(OPEN_BODY_CLASS)
  state.stopTracking()
  state.restoreScrolling()
  render(null, state.container)
  state.container.remove()
  state.board.style.visibility = state.previousVisibility
}

export async function open(): Promise<void> {
  if (mounted || opening) return
  opening = true
  try {
    const board = findBoardElement()
    if (!board) {
      notifyError('Table view', 'This page does not look like a board.')
      return
    }

    const boardModel = await loadCurrentBoard()
    if (!boardModel) {
      notifyError('Table view', 'Could not load this board. Reload the page and try again.')
      return
    }

    const container = document.createElement('div')
    container.className = 'ktv-root'

    const previousVisibility = board.style.visibility
    // visibility, not display: the board keeps its box, so it stays measurable.
    board.style.visibility = 'hidden'

    positionOver(container, board)
    document.body.appendChild(container)
    const stopTracking = trackBoard(container, board)
    const restoreScrolling = lockPageScrolling()

    const store = new BoardStore(boardModel)
    mounted = { container, board, previousVisibility, restoreScrolling, store, stopTracking }
    document.body.classList.add(OPEN_BODY_CLASS)

    render(
      h(TableView, { store, onClose: close, showBoard: close }),
      container,
    )

    log(
      `table view open: ${store.rows.length} cards, ${store.columns.length} columns,`,
      `${container.style.width} x ${container.style.height}`,
    )
    warnIfCovered(container)
  } catch (err) {
    warn('failed to open the table view', err)
    notifyError('Table view', 'Something went wrong opening the table view.')
    close()
  } finally {
    opening = false
  }
}

/**
 * A correctly sized overlay that nothing paints is indistinguishable from a broken one.
 * Two different faults look identical on screen, so name which one it is:
 *
 *   * the host page's CSS hid us (what the custom-theme extension did - it hides
 *     <body> children it does not recognise), or
 *   * something is painted on top.
 *
 * The first masquerades as the second, because an invisible element is not hit-testable
 * and `elementFromPoint` falls through to whatever is behind it - which is how this was
 * first misreported as "painted over by <html>".
 */
function warnIfCovered(container: HTMLElement): void {
  requestAnimationFrame(() => {
    if (!mounted || mounted.container !== container) return
    const rect = container.getBoundingClientRect()
    if (rect.width < MIN_USABLE_PX || rect.height < MIN_USABLE_PX) return

    // Only an explicit value counts. Environments that do not compute styles return
    // empty strings, and reading those as "hidden" reports a fault that is not there.
    const computed = getComputedStyle(container)
    const hiddenBy: string[] = []
    if (computed.visibility && computed.visibility !== 'visible') {
      hiddenBy.push(`visibility: ${computed.visibility}`)
    }
    if (computed.display === 'none') hiddenBy.push('display: none')
    if (computed.opacity !== '' && Number(computed.opacity) === 0) hiddenBy.push('opacity: 0')

    if (hiddenBy.length > 0) {
      warn(`the page's CSS is hiding the table (${hiddenBy.join(', ')})`, container)
      notifyError(
        'Table view is hidden',
        `The table opened but the page's styles are hiding it (${hiddenBy.join(', ')}).`,
      )
      return
    }

    if (typeof document.elementFromPoint !== 'function') return
    const onTop = document.elementFromPoint(
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + rect.height / 2),
    )
    if (!onTop || container.contains(onTop)) return

    warn('the table is being painted over by another element', onTop)
    notifyError(
      'Table view is hidden',
      'The table opened but something on the page is covering it. Run KTTableView.inspect() and report the output.',
    )
  })
}

export function toggle(): void {
  if (mounted) close()
  else void open()
}

/**
 * The board re-renders on navigation between boards and on some board-level changes.
 * Our overlay belongs to the board element we captured, so close rather than leave a
 * stale table over a different board.
 */
export function onBoardRerender(): void {
  if (!mounted) return
  if (!document.contains(mounted.board)) close()
}
