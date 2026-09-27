// Multi-row writes go through KT.tasks.groupUpdate, the SDK's own bulk path, rather
// than a loop of individual saves: it is one request, and it is the same code path the
// board's context-menu bulk actions use, so board-side hooks (groupUpdateFilters) and
// automation behave identically whether the change came from the board or the table.

import { notify, notifyError, requireKT } from '../kt/env'
import { canEditAttribute } from '../kt/permissions'
import type { TaskAttributes } from '../kt/types'

export interface BulkResult {
  ok: boolean
  count: number
}

export function bulkUpdate(
  taskIds: number[],
  attributes: Partial<TaskAttributes>,
  boardId?: number,
): BulkResult {
  const ids = [...new Set(taskIds)]
  const attributeNames = Object.keys(attributes)
  if (ids.length === 0 || attributeNames.length === 0) return { ok: true, count: 0 }

  const blocked = attributeNames.filter((name) => !canEditAttribute(name, boardId))
  if (blocked.length > 0) {
    notifyError(
      'Change not applied',
      `You do not have permission to change ${blocked.join(', ')} on this board.`,
    )
    return { ok: false, count: 0 }
  }

  try {
    requireKT().tasks.groupUpdate(ids, attributes)
    notify('Cards updated', `${ids.length} card${ids.length === 1 ? '' : 's'} updated.`)
    return { ok: true, count: ids.length }
  } catch (err) {
    notifyError('Change not applied', err instanceof Error ? err.message : String(err))
    return { ok: false, count: 0 }
  }
}
