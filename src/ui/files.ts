// A "Files" button on Kanban Tool's own card view, opening the card's images over it.
//
// The card is the host's `<kt-taskview>` wherever it was opened from - the board, or the
// ↗ in the table, which clicks the same `<kt-task>` a user would - so one watcher
// covers both. The host renders the card's contents itself and may redraw them at any
// time, taking our button with it, so the button is put back whenever it goes missing
// rather than added once.
//
// Which card is open: the task view is asked first, the same way a `<kt-task>` carries
// its id (`readTaskId`); failing that, the last `<kt-task>` clicked, which is how every
// card on a board gets opened. The dialog is built beside the card, on <body>, rather
// than inside host markup, and closes when the card does.
//
// Where the button goes, best first: inside the card's "Attachments" heading, beside
// its text; before the attachments section when no heading is found; at the top of the
// card when there is no attachments section at all. It is inside the heading rather
// than after it because the heading may be a block that would push a sibling onto its
// own line - and a button inside a `<label>` is safe, since a label does nothing when
// the click lands on an interactive element within it.

import { h, render } from 'preact'
import { log, warn } from '../kt/env'
import { findTaskViewElement, readTaskId } from '../kt/openTask'
import { ATTACHMENTS_ELEMENT, findAttachmentsHeading } from '../kt/selectors'
import { FilesDialog } from './FilesDialog'

const BUTTON_CLASS = 'ktv-files-launch'
const BUTTON_LABEL = 'Browse files'

type Placement = 'heading' | 'section' | 'card'

interface DialogState {
  container: HTMLElement
  taskview: HTMLElement
  taskId: number
  viewing: number | null
  count: number
  cleanup: () => void
}

let dialog: DialogState | null = null
let lastClickedTaskId: number | null = null
let installed = false
/** Last placement logged, so a card redrawing does not repeat the same line. */
let loggedPlacement: Placement | null = null

function taskIdFor(taskview: HTMLElement): number | null {
  return readTaskId(taskview) ?? lastClickedTaskId
}

/** Host listeners that close a card on an outside click must never see ours. */
const SWALLOWED_EVENTS = ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'touchstart'] as const

function renderDialog(): void {
  if (!dialog) return
  const state = dialog
  render(
    h(FilesDialog, {
      taskId: state.taskId,
      viewing: state.viewing,
      onView: (index: number | null) => {
        state.viewing = index
        renderDialog()
      },
      onClose: closeFiles,
      onLoaded: (count: number) => {
        state.count = count
      },
    }),
    state.container,
  )
}

/**
 * Keys belong to the dialog while it is up. Listening on `window` in the capture phase
 * puts this ahead of both the host's Escape (which would close the card underneath) and
 * the table's own, which listens on `document`.
 */
function onKey(event: KeyboardEvent): void {
  if (!dialog) return
  const state = dialog
  const stepTo = (by: number): void => {
    if (state.viewing === null || state.count < 2) return
    state.viewing = (state.viewing + by + state.count) % state.count
    renderDialog()
  }

  if (event.key === 'Escape') {
    if (state.viewing !== null) {
      state.viewing = null
      renderDialog()
    } else {
      closeFiles()
    }
  } else if (event.key === 'ArrowLeft') {
    stepTo(-1)
  } else if (event.key === 'ArrowRight') {
    stepTo(1)
  } else {
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
}

export function isFilesOpen(): boolean {
  return dialog !== null
}

export function closeFiles(): void {
  if (!dialog) return
  const state = dialog
  dialog = null
  state.cleanup()
  render(null, state.container)
  state.container.remove()
}

export function openFiles(taskview: HTMLElement): void {
  closeFiles()
  const taskId = taskIdFor(taskview)
  if (taskId === null) {
    warn('could not tell which card is open; the Files dialog was not opened', taskview)
    return
  }

  const container = document.createElement('div')
  // `.ktv-root` for the same reason the table carries it: the custom-theme extension
  // hides <body> children it does not recognise, and that class is what refuses.
  container.className = 'ktv-root ktv-files-root'
  const stop = (event: Event): void => event.stopPropagation()
  for (const type of SWALLOWED_EVENTS) container.addEventListener(type, stop)
  // A click on the dim backdrop, and only the backdrop, closes the dialog.
  container.addEventListener('click', (event) => {
    if (event.target === container) closeFiles()
  })
  document.body.appendChild(container)
  window.addEventListener('keydown', onKey, true)

  dialog = {
    container,
    taskview,
    taskId,
    viewing: null,
    count: 0,
    cleanup: () => window.removeEventListener('keydown', onKey, true),
  }
  log(`files for task ${taskId}`)
  renderDialog()
}

function createButton(taskview: HTMLElement, placement: Placement): HTMLElement {
  const wrapper = document.createElement('span')
  wrapper.className = `${BUTTON_CLASS} ${BUTTON_CLASS}--${placement}`
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ktv-files-button'
  button.textContent = BUTTON_LABEL
  button.title = "Show this card's images"
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openFiles(taskview)
  })
  wrapper.appendChild(button)
  return wrapper
}

/** Puts the button where it belongs in this card; see the note at the top of the file. */
function place(taskview: HTMLElement): void {
  const heading = findAttachmentsHeading(taskview)
  const section = heading ? null : taskview.querySelector(ATTACHMENTS_ELEMENT)
  const placement: Placement = heading ? 'heading' : section ? 'section' : 'card'

  const existing = taskview.querySelector<HTMLElement>(`.${BUTTON_CLASS}`)
  if (existing?.classList.contains(`${BUTTON_CLASS}--${placement}`)) {
    const inPlace =
      placement === 'heading'
        ? existing.parentElement === heading
        : placement === 'section'
          ? existing.nextElementSibling === section
          : existing.parentElement === taskview
    if (inPlace) return
  }
  existing?.remove()

  const button = createButton(taskview, placement)
  if (heading) heading.appendChild(button)
  else if (section) section.before(button)
  else taskview.prepend(button)

  if (placement !== loggedPlacement) {
    loggedPlacement = placement
    log(
      placement === 'heading'
        ? 'files button: beside the Attachments heading'
        : placement === 'section'
          ? 'files button: no Attachments heading found, placed above the attachments section'
          : 'files button: no attachments section in this card, placed at the top',
    )
  }
}

/** Puts a button on the open card if it has none, and closes a dialog it has outlived. */
export function syncFilesButton(): void {
  const taskview = findTaskViewElement()
  if (dialog && dialog.taskview !== taskview) closeFiles()
  if (taskview) place(taskview)
}

function rememberClickedTask(event: Event): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const card = target.closest('kt-task')
  if (!card) return
  const id = readTaskId(card)
  if (id !== null) lastClickedTaskId = id
}

/**
 * Watches for cards opening and redrawing. The observer's work is batched to one pass
 * per frame: a big board mutates constantly, and each pass costs a style lookup.
 */
export function installFilesButton(): void {
  if (installed) return
  installed = true
  document.addEventListener('click', rememberClickedTask, true)

  let scheduled = false
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      try {
        syncFilesButton()
      } catch (err) {
        warn('files button sync failed', err)
      }
    })
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    })
  }
  schedule()
}
