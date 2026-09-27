// Filtering is deliberately one predictable rule: case-insensitive substring match
// against what the cell *shows*. Matching the display string rather than the raw value
// means a filter of "high" finds priority 1 and "Sam" finds assignee id 42 - the user
// filters by what is on screen. Two blank-aware tokens cover the common gap.

import type { ColumnDef } from './columns'
import type { Row } from './rows'

export const EMPTY_TOKEN = 'is:empty'
export const NOT_EMPTY_TOKEN = 'is:set'

export interface FilterState {
  /** Per-column filter text, keyed by column id. */
  columns: Record<string, string>
  /** Matches any visible column. */
  search: string
}

export const EMPTY_FILTER: FilterState = { columns: {}, search: '' }

function matchesTerm(display: string, term: string): boolean {
  const needle = term.trim().toLowerCase()
  if (needle === '') return true
  if (needle === EMPTY_TOKEN) return display.trim() === ''
  if (needle === NOT_EMPTY_TOKEN) return display.trim() !== ''
  return display.toLowerCase().includes(needle)
}

export function buildPredicate(
  filter: FilterState,
  visibleColumns: ColumnDef[],
): (row: Row) => boolean {
  const columnTerms = Object.entries(filter.columns).filter(
    ([, term]) => term.trim() !== '',
  )
  const search = filter.search.trim().toLowerCase()

  return (row: Row) => {
    for (const [columnId, term] of columnTerms) {
      if (!matchesTerm(row.display[columnId] ?? '', term)) return false
    }
    if (search === '') return true
    return visibleColumns.some((column) =>
      matchesTerm(row.display[column.id] ?? '', search),
    )
  }
}

export function filterRows(
  rows: Row[],
  filter: FilterState,
  visibleColumns: ColumnDef[],
): Row[] {
  const predicate = buildPredicate(filter, visibleColumns)
  return rows.filter(predicate)
}

export function hasActiveFilter(filter: FilterState): boolean {
  return (
    filter.search.trim() !== '' ||
    Object.values(filter.columns).some((term) => term.trim() !== '')
  )
}
