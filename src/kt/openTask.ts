// Opening a card from the table hands off to Kanban Tool's own task view rather than
// reimplementing it - description, comments, attachments, checklists and time tracking
// all already live there, and duplicating them would be a second thing to keep correct.
//
// The SDK documents `<kt-task>` as a custom element and `kt-taskview:open` as an event,
// but it exposes no documented "open this task" call. So we click the card's own
// element, which is what a user would do. That needs the board visible, hence the
// `showBoard` callback.
//
// CONFIRM ON THE PILOT BOARD: the attribute `<kt-task>` carries its task id in. The
// candidates below cover the usual shapes; replace them with the real one once known.

import { notify, warn } from './env'

const ID_ATTRIBUTES = ['data-id', 'data-task-id', 'task-id', 'id'] as const

export function findTaskElement(taskId: number, root: ParentNode = document): HTMLElement | null {
  for (const attribute of ID_ATTRIBUTES) {
    const selector =
      attribute === 'id'
        ? `kt-task#task_${taskId}, kt-task#task-${taskId}`
        : `kt-task[${attribute}="${taskId}"]`
    const element = root.querySelector<HTMLElement>(selector)
    if (element) return element
  }
  return null
}

/**
 * Returns true when the card was opened. On false the caller should stay in the table -
 * we have already told the user what happened.
 */
export function openTask(taskId: number, showBoard: () => void): boolean {
  showBoard()
  const element = findTaskElement(taskId)
  if (!element) {
    warn('could not locate the card element for task', taskId)
    notify('Card not on screen', 'Open the card from the board - it may be in a collapsed or filtered column.')
    return false
  }
  element.click()
  return true
}
