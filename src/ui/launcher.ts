// Getting the user into the table view.
//
// Three lessons from the first real board are baked in here:
//
//  1. `KT.Elements.Board.contextMenu` is NOT an array. It exists and has `push`, but
//     calling array methods on it throws. Treat it as "something with push", nothing more.
//  2. A throw anywhere in setup used to abort everything after it, because setup runs
//     inside KT.onInit. Each step is now independently guarded.
//  3. The board header markup did not match any selector we guessed. So the button no
//     longer depends on finding it: when no toolbar matches we float the button over the
//     page instead. The feature is reachable on any board, guessed selectors or not.

import { BUILD, getJQuery, getKT, log, warn } from '../kt/env'
import { findToolbarElement } from '../kt/selectors'
import { behindZIndex, stackingZIndex, taskViewOwnsEscape } from '../kt/openTask'
import { close, isOpen, onBoardRerender, toggle } from './overlay'
import { installFilesButton } from './files'
import type { ContextMenuEntry } from '../kt/types'

const BUTTON_ID = 'ktv-launch-button'
const BUTTON_LABEL = 'Table'
const CONTEXT_MENU_NAME = 'Table view'

let contextMenuRegistered = false

/** Runs `step`, reporting failure without letting it take down the rest of setup. */
function guard(name: string, step: () => void): void {
  try {
    step()
  } catch (err) {
    warn(`${name} failed; continuing without it`, err)
  }
}

/**
 * In the navbar the button is an <a>, matching the Share / Settings / Help links it
 * sits beside so the host page's own styling applies and it does not look bolted on.
 * Floating, it is a real button with our styling, since it has no neighbours to match.
 */
function createButton(floating: boolean): HTMLElement {
  const element = document.createElement(floating ? 'button' : 'a')
  element.id = BUTTON_ID
  element.className = floating ? 'ktv-launch ktv-launch-floating' : 'ktv-launch-inline'
  element.textContent = BUTTON_LABEL
  element.title = 'Show this board as a table'
  if (element instanceof HTMLButtonElement) element.type = 'button'
  element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggle()
  })
  return element
}

/**
 * Prefers a real spot in the board header. Falls back to a floating button fixed to the
 * viewport, which needs no knowledge of Kanban Tool's markup at all.
 */
export function mountLaunchButton(): void {
  const existing = document.getElementById(BUTTON_ID)
  const toolbar = findToolbarElement()

  if (existing) {
    // Re-home the button if a toolbar has appeared since it was floated.
    if (toolbar && existing.classList.contains('ktv-launch-floating')) existing.remove()
    else return
  }

  if (toolbar) {
    toolbar.appendChild(createButton(false))
    return
  }

  document.body.appendChild(createButton(true))
}

export function registerContextMenu(): void {
  if (contextMenuRegistered) return
  const board = getKT()?.Elements?.Board
  const menu = board?.contextMenu as { push?: (entry: ContextMenuEntry) => unknown } | undefined

  // Not an array: it only reliably has `push`, so we track registration ourselves
  // rather than scanning it for an existing entry.
  if (!menu || typeof menu.push !== 'function') {
    warn('KT.Elements.Board.contextMenu has no push(); the right-click entry was not added')
    return
  }

  menu.push({
    name: CONTEXT_MENU_NAME,
    permissions: 'read_tasks',
    action: () => toggle(),
  })
  contextMenuRegistered = true
}

function watchBoardRenders(): void {
  const $ = getJQuery()
  const handler = (): void => {
    guard('board re-render handling', onBoardRerender)
    guard('launch button', mountLaunchButton)
  }
  if ($) $(window).on('kt-board:render', handler)
  else window.addEventListener('kt-board:render', handler)
}

function watchEscape(): void {
  const handler = (event: KeyboardEvent): void => {
    // Only when nothing is being typed into, so Escape still cancels a cell edit first.
    const target = event.target as HTMLElement | null
    const typing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    // A card open over the table owns Escape: it closes the card, and the user is left
    // in the table. Closing both at once would skip a step they did not ask for.
    if (event.key === 'Escape' && isOpen() && !taskViewOwnsEscape(event.timeStamp) && !typing) {
      close()
    }
  }
  // Capture, so the state this reads is the state the keystroke started in rather than
  // whatever the host's own Escape handling has already changed it to.
  document.addEventListener('keydown', handler, true)
}

export function installLauncher(): void {
  guard('launch button', mountLaunchButton)
  guard('context menu entry', registerContextMenu)
  guard('board render watcher', watchBoardRenders)
  guard('escape handler', watchEscape)
  guard('files button', installFilesButton)
  log(`table view ready (build ${BUILD})`)
}

/** `tag#id.class` plus everything that decides whether an element is seen and where. */
function describeElement(element: Element): string {
  const computed = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const id = element.id ? `#${element.id}` : ''
  const classes = typeof element.className === 'string' && element.className
    ? `.${element.className.trim().split(/\s+/).join('.')}`
    : ''
  return (
    `${element.tagName.toLowerCase()}${id}${classes} ` +
    `[${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)};` +
    ` position: ${computed.position}; z-index: ${computed.zIndex};` +
    ` display: ${computed.display}; visibility: ${computed.visibility}]`
  )
}

function isWorthReporting(element: Element): boolean {
  const rect = element.getBoundingClientRect()
  return rect.width > 20 && rect.height > 20
}

/** Ancestors up to <body>, nearest first - where an element really lives. */
function homeOf(element: Element): string {
  const chain: string[] = []
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const id = node.id ? `#${node.id}` : ''
    const classes = typeof node.className === 'string' && node.className
      ? `.${node.className.trim().split(/\s+/)[0]}`
      : ''
    chain.push(`${node.tagName.toLowerCase()}${id}${classes}`)
    if (chain.length >= 8) break
  }
  return chain.join(' < ')
}

/**
 * Prints what the host puts on screen for an open card, which is what a card needs to
 * bring with it when it is opened over the table: the task view itself, anything that
 * looks like a side panel, and every visible text box - the comment composer is one, and
 * finding it says where the activity list lives.
 *
 * Run it with a card open, on the board and then over the table, and compare.
 * Call KTTableView.probeCard().
 */
export function probeCard(): void {
  log('build:', BUILD)

  const taskview = document.querySelector('kt-taskview') as HTMLElement | null
  log('kt-taskview:', taskview ? describeElement(taskview) : 'none in the DOM')
  if (taskview) {
    log('  lives in:', homeOf(taskview) || '<body>')
    log(
      '  siblings:',
      [...(taskview.parentElement?.children ?? [])]
        .filter((el) => el !== taskview)
        .map(describeElement),
    )
  }

  log(
    'direct children of <body>:',
    [...document.body.children].filter(isWorthReporting).map(describeElement),
  )

  // A side panel names itself somewhere in its id or class on every app that has one.
  const named = [...document.querySelectorAll('*')].filter(
    (el) =>
      /side|panel|comment|activity|history|feed|stream|discussion|drawer|aside/i.test(
        `${el.id} ${typeof el.className === 'string' ? el.className : ''}`,
      ) && isWorthReporting(el),
  )
  log(`elements named like a panel (${named.length}, first 20):`)
  for (const element of named.slice(0, 20)) log('  ', describeElement(element), '|', homeOf(element))

  // The comment composer is a text box, and the shortest route to the activity list.
  const boxes = [...document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]')]
    .filter(isWorthReporting)
  log(`visible text boxes (${boxes.length}):`)
  for (const box of boxes) log('  ', describeElement(box), '|', homeOf(box))
}

/** Each ancestor that could be hiding or layering an element, as a readable line. */
function ancestorChain(element: HTMLElement): string[] {
  const chain: string[] = []
  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const computed = getComputedStyle(node)
    const name = `${node.tagName.toLowerCase()}${node.className ? `.${node.className}` : ''}`
    chain.push(
      `${name} [position: ${computed.position}, z-index: ${computed.zIndex},` +
        ` visibility: ${computed.visibility}, display: ${computed.display}]`,
    )
  }
  return chain
}

/**
 * Prints what is needed to pin down the host page's markup. Call KTTableView.inspect().
 *
 * Deliberately narrow: an earlier version listed every element matching /header/, which
 * on a real board is eleven per-card `.kt-task-header` elements and nothing useful.
 */
export function inspect(): void {
  log('build:', BUILD)
  const board = document.querySelector('kt-board')
  log('kt-board:', board)
  log('kt-board attributes:', board ? [...board.attributes].map((a) => `${a.name}="${a.value}"`) : [])
  log('kt-board rect:', board?.getBoundingClientRect())

  const styleTag = document.getElementById('ktv-styles')
  log('stylesheet:', styleTag ? `${styleTag.textContent?.length ?? 0} chars in <head>` : 'MISSING')

  const overlay = document.querySelector('.ktv-root') as HTMLElement | null
  log('overlay:', overlay ? `${overlay.style.width} x ${overlay.style.height}` : 'not open')
  if (overlay) {
    const rect = overlay.getBoundingClientRect()
    const computed = getComputedStyle(overlay)
    log('overlay rect:', rect)
    log('overlay computed:', {
      position: computed.position,
      zIndex: computed.zIndex,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      background: computed.backgroundColor,
      overflow: computed.overflow,
    })
    log('overlay children:', overlay.childElementCount)
    const firstChild = overlay.firstElementChild as HTMLElement | null
    log('first child:', firstChild?.className, firstChild?.getBoundingClientRect())

    // Decisive: what is actually painted at the middle of the overlay? If this is not
    // one of our own .ktv-* elements, something is covering us.
    const x = Math.round(rect.left + rect.width / 2)
    const y = Math.round(rect.top + rect.height / 2)
    const onTop = document.elementFromPoint(x, y)
    log(`topmost element at overlay centre (${x}, ${y}):`, onTop)
    log('  its classes:', onTop?.className, '| tag:', onTop?.tagName)
  }

  // Everything about an open card, which is the other thing that has needed pinning
  // down on a real board: where the task view sits, how deep it is painted, and - since
  // closing a card hides it rather than removing it - how it is currently hidden.
  const taskview = document.querySelector('kt-taskview') as HTMLElement | null
  log('kt-taskview:', taskview ?? 'none in the DOM');
  if (taskview) {
    const computed = getComputedStyle(taskview)
    log('kt-taskview computed:', {
      display: computed.display,
      visibility: computed.visibility,
      position: computed.position,
      zIndex: computed.zIndex,
    })
    log('kt-taskview inline visibility:', JSON.stringify(taskview.style.visibility))
    log('kt-taskview rect:', taskview.getBoundingClientRect())
    log('kt-taskview ancestors (outermost last):', ancestorChain(taskview))
    log('measured layer:', stackingZIndex(taskview), '-> table drops to', behindZIndex(taskview))
  }

  // The navbar is the only page-level chrome on a board, and the one place a header
  // button could sensibly go. Its structure is what decides the mount selector.
  const navbar = document.querySelector('nav.navbar, .navbar')
  if (!navbar) {
    log('no .navbar on this page')
  } else {
    log('navbar outerHTML (first 2000 chars):')
    log(navbar.outerHTML.slice(0, 2000))
    log(
      'navbar direct children:',
      [...navbar.children].map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
    )
  }

  log('matched toolbar mount point:', findToolbarElement() ?? 'none - button is floating')
}
