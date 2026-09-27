// Type-aware sorting. Sorting a date column as text happens to work for Y-m-d, but
// durations, numbers and select columns all need their own comparison, and blanks
// always sort last regardless of direction - an empty due date is not "earliest".

import type { ColumnDef } from './columns'
import type { Row } from './rows'
import { toNumber } from './format'

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  columnId: string
  direction: SortDirection
}

function isBlank(value: unknown, display: string): boolean {
  return value === null || value === undefined || value === '' || display === ''
}

function compareValues(column: ColumnDef, a: Row, b: Row): number {
  const aValue = a.values[column.id]
  const bValue = b.values[column.id]
  const aDisplay = a.display[column.id] ?? ''
  const bDisplay = b.display[column.id] ?? ''

  const aBlank = isBlank(aValue, aDisplay)
  const bBlank = isBlank(bValue, bDisplay)
  if (aBlank && bBlank) return 0
  if (aBlank) return 1
  if (bBlank) return -1

  switch (column.kind) {
    case 'number':
    case 'count':
    case 'duration':
    case 'priority':
    case 'progress': {
      const aNum = toNumber(aValue) ?? 0
      const bNum = toNumber(bValue) ?? 0
      return aNum === bNum ? 0 : aNum < bNum ? -1 : 1
    }
    case 'date':
      // Y-m-d sorts correctly as a string, and avoids timezone shifts.
      return aDisplay.localeCompare(bDisplay)
    default:
      return aDisplay.localeCompare(bDisplay, undefined, {
        sensitivity: 'base',
        numeric: true,
      })
  }
}

/**
 * Blanks stay last in both directions, so `direction` only flips the ordering of the
 * rows that actually have a value.
 */
export function sortRows(rows: Row[], column: ColumnDef | undefined, direction: SortDirection): Row[] {
  if (!column) return rows
  const factor = direction === 'desc' ? -1 : 1
  return rows.slice().sort((a, b) => {
    const aBlank = isBlank(a.values[column.id], a.display[column.id] ?? '')
    const bBlank = isBlank(b.values[column.id], b.display[column.id] ?? '')
    if (aBlank !== bBlank) return aBlank ? 1 : -1
    const result = compareValues(column, a, b)
    return result === 0 ? a.id - b.id : result * factor
  })
}
