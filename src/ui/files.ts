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
// The button is prepended to `<kt-taskview>` because nothing narrower in the card's
// markup has been confirmed yet. If it should sit in the card's header instead, that is
// a selector for `src/kt/selectors.ts`, not a change here.

import { h, render } from 'preact'
import { log, warn } from '../kt/env'
import { findTaskViewElement, readTaskId } from '../kt/openTask'
import { FilesDialog } from './FilesDialog'

const BUTTON_CLASS = 'ktv-files-launch'

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

function createButton(taskview: HTMLElement): HTMLElement {
  const bar = document.createElement('div')
  bar.className = BUTTON_CLASS
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'ktv-files-button'
  button.textContent = 'Files'
  button.title = "Show this card's images"
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openFiles(taskview)
  })
  bar.appendChild(button)
  return bar
}

/** Puts a button on the open card if it has none, and closes a dialog it has outlived. */
export function syncFilesButton(): void {
  const taskview = findTaskViewElement()
  if (dialog && dialog.taskview !== taskview) closeFiles()
  if (!taskview) return
  if (taskview.querySelector(`:scope > .${BUTTON_CLASS}`)) return
  taskview.prepend(createButton(taskview))
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
