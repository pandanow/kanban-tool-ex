// Filtering is deliberately one predictable rule: case-insensitive substring match
// against what the cell *shows*. Matching the display string rather than the raw value
// means a filter of "high" finds priority 1 and "Sam" finds assignee id 42 - the user
// filters by what is on screen. Two blank-aware tokens cover the common gap.
//
// One column filters differently. A checklist column (see ColumnDef.filterKind) stores
// the set of option values the user ticked, and matches the *stored* value rather than
// the display text: the boxes are generated from the board's own option list, so there
// is no typing to be lenient about, and two stages whose labels share a prefix must not
// match each other.

import type { ColumnDef } from './columns'
import type { Row } from './rows'

export const EMPTY_TOKEN = 'is:empty'
export const NOT_EMPTY_TOKEN = 'is:set'

/** Free text, or the ticked option values of a checklist column. */
export type ColumnFilter = string | string[]

export interface FilterState {
  /** Per-column filter, keyed by column id. */
  columns: Record<string, ColumnFilter>
  /** Matches any visible column. */
  search: string
}

export const EMPTY_FILTER: FilterState = { columns: {}, search: '' }

/** Nothing ticked means "no opinion", the same as an empty text box. */
export function isActiveTerm(term: ColumnFilter | undefined): boolean {
  if (term === undefined) return false
  return Array.isArray(term) ? term.length > 0 : term.trim() !== ''
}

export function selectedValues(term: ColumnFilter | undefined): string[] {
  return Array.isArray(term) ? term : []
}

/** How a row's stored value is written in a checklist's ticked set. */
export function filterValueKey(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

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
  const columnTerms = Object.entries(filter.columns).filter(([, term]) =>
    isActiveTerm(term),
  )
  const search = filter.search.trim().toLowerCase()

  return (row: Row) => {
    for (const [columnId, term] of columnTerms) {
      if (Array.isArray(term)) {
        if (!term.includes(filterValueKey(row.values[columnId]))) return false
      } else if (!matchesTerm(row.display[columnId] ?? '', term)) {
        return false
      }
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
    filter.search.trim() !== '' || Object.values(filter.columns).some(isActiveTerm)
  )
}
