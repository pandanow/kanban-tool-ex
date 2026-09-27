// Single-cell writes.
//
// Backbone's `save` applies the attribute locally before the request and does not roll
// back on failure, so we snapshot the old value and restore it ourselves. That matters
// here more than in most apps: tasks carry `version`/`board_version`, so a write can be
// rejected simply because someone else touched the card while the editor was open. The
// user must see the value snap back and be told why, not silently diverge from the board.

import { notifyError } from '../kt/env'
import { canEditAttribute } from '../kt/permissions'
import type { KTTask, TaskAttributes } from '../kt/types'

export interface SaveResult {
  ok: boolean
  reason?: 'permission' | 'rejected'
}

function errorMessage(response: unknown): string {
  if (response && typeof response === 'object') {
    const res = response as { status?: number; responseJSON?: { error?: string }; statusText?: string }
    if (res.responseJSON?.error) return res.responseJSON.error
    if (res.status === 409 || res.status === 412) {
      return 'This card changed somewhere else while you were editing. Your change was not applied.'
    }
    if (res.status === 403) return 'You do not have permission to change this card.'
    if (res.statusText) return res.statusText
  }
  return 'The change could not be saved.'
}

export function saveCell(
  task: KTTask,
  attribute: string,
  value: unknown,
): Promise<SaveResult> {
  const boardId = task.get('board_id')
  if (!canEditAttribute(attribute, boardId)) {
    return Promise.resolve({ ok: false, reason: 'permission' })
  }

  const previous = task.get(attribute as keyof TaskAttributes)
  if (previous === value) return Promise.resolve({ ok: true })

  return new Promise<SaveResult>((resolve) => {
    task.save({ [attribute]: value } as Partial<TaskAttributes>, {
      patch: true,
      success: () => resolve({ ok: true }),
      error: (_model, response) => {
        // Restore what the board still believes, then say why.
        task.set({ [attribute]: previous } as Partial<TaskAttributes>)
        notifyError('Change not saved', errorMessage(response))
        resolve({ ok: false, reason: 'rejected' })
      },
    })
  })
}
