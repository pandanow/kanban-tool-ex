// Per-user, per-board view preferences (group-by, sort, filters, column visibility and
// widths). These are a personal convenience, not shared state, so localStorage is the
// right home - there is no Kanban Tool API for storing per-user view config.
//
// Every read and write is guarded: private windows and blocked site data make these
// accessors throw, and a lost preference must never stop the table from rendering.

import { warn } from './env'
import type { ColumnFilter } from '../model/filtering'

const VERSION = 1
const PREFIX = 'kt-table-view'

export interface StoredViewState {
  version: number
  groupBy: string | null
  sort: { columnId: string; direction: 'asc' | 'desc' } | null
  /** Free-text search across every visible column. */
  search: string
  /** Per-column filter - text, or the ticked values of a checklist column. */
  filters: Record<string, ColumnFilter>
  /** Whether the per-column filter row is shown. */
  showFilters: boolean
  /** null means "no explicit choice yet" - fall back to each column's own default. */
  hiddenColumns: string[] | null
  columnWidths: Record<string, number>
  collapsedGroups: string[]
}

export const EMPTY_VIEW_STATE: StoredViewState = {
  version: VERSION,
  groupBy: 'workflow_stage_id',
  sort: null,
  search: '',
  filters: {},
  showFilters: false,
  hiddenColumns: null,
  columnWidths: {},
  collapsedGroups: [],
}

function key(boardId: number, userId: number | string | undefined): string {
  return `${PREFIX}:${VERSION}:u${userId ?? 'anon'}:b${boardId}`
}

export function loadViewState(
  boardId: number,
  userId?: number | string,
): StoredViewState {
  try {
    const raw = window.localStorage.getItem(key(boardId, userId))
    if (!raw) return { ...EMPTY_VIEW_STATE }
    const parsed = JSON.parse(raw) as Partial<StoredViewState>
    if (parsed.version !== VERSION) return { ...EMPTY_VIEW_STATE }
    return { ...EMPTY_VIEW_STATE, ...parsed, version: VERSION }
  } catch (err) {
    warn('could not read saved view state, using defaults', err)
    return { ...EMPTY_VIEW_STATE }
  }
}

export function saveViewState(
  boardId: number,
  userId: number | string | undefined,
  state: StoredViewState,
): void {
  try {
    window.localStorage.setItem(key(boardId, userId), JSON.stringify(state))
  } catch (err) {
    warn('could not persist view state', err)
  }
}
