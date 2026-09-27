// Permission checks delegate to Kanban Tool's own model - we never invent our own
// rules. A cell the user may not change renders read-only rather than letting them
// type into it and failing on save.

import { getKT } from './env'
import type { Permission } from './types'

export function can(permission: Permission, boardId?: number): boolean {
  const user = getKT()?.currentUser
  if (!user || typeof user.can !== 'function') return false
  try {
    return user.can(permission, boardId) === true
  } catch {
    return false
  }
}

/** Attributes that move a card between stages or lanes need `move_tasks`, not `update_tasks`. */
const MOVE_ATTRIBUTES = new Set(['workflow_stage_id', 'swimlane_id', 'position'])

export function permissionForAttribute(attribute: string): Permission {
  return MOVE_ATTRIBUTES.has(attribute) ? 'move_tasks' : 'update_tasks'
}

export function canEditAttribute(attribute: string, boardId?: number): boolean {
  return can(permissionForAttribute(attribute), boardId)
}
