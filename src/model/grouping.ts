// Grouping gives the table its Monday-style "Main Table" shape: collapsible sections
// with counts. Grouping by stage is the default because it mirrors how the same cards
// are laid out on the board, which is what makes the two views legible as one thing.

import type { ColumnDef } from './columns'
import type { Row } from './rows'

export interface RowGroup {
  /** Stable key for collapse state; '' means the blank/unset group. */
  key: string
  label: string
  rows: Row[]
}

const BLANK_LABELS: Record<string, string> = {
  workflow_stage_id: 'No stage',
  swimlane_id: 'No swimlane',
  assigned_user_id: 'Unassigned',
  card_type_id: 'No card type',
  priority: 'No priority',
}

function blankLabel(column: ColumnDef): string {
  return BLANK_LABELS[column.id] ?? `No ${column.label.toLowerCase()}`
}

/**
 * Groups follow the column's own option order where it has one (stage order, swimlane
 * order, priority order), so the table reads in the same sequence as the board. The
 * blank group always comes last. Empty option groups are dropped rather than shown as
 * empty sections.
 */
export function groupRows(rows: Row[], column: ColumnDef | undefined): RowGroup[] {
  if (!column) return [{ key: '', label: '', rows }]

  const buckets = new Map<string, Row[]>()
  for (const row of rows) {
    const value = row.values[column.id]
    const key = value === null || value === undefined || value === '' ? '' : String(value)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(row)
    else buckets.set(key, [row])
  }

  const groups: RowGroup[] = []
  const seen = new Set<string>()

  for (const option of column.options ?? []) {
    const key = option.value === null || option.value === undefined ? '' : String(option.value)
    if (key === '' || seen.has(key)) continue
    const bucket = buckets.get(key)
    seen.add(key)
    if (bucket && bucket.length > 0) {
      groups.push({ key, label: option.label, rows: bucket })
    }
  }

  // Values with no matching option (a deleted card type, a user who left the board).
  const leftovers = [...buckets.keys()]
    .filter((key) => key !== '' && !seen.has(key))
    .sort((a, b) => {
      const aLabel = buckets.get(a)?.[0]?.display[column.id] ?? a
      const bLabel = buckets.get(b)?.[0]?.display[column.id] ?? b
      return aLabel.localeCompare(bLabel, undefined, { numeric: true })
    })
  for (const key of leftovers) {
    const bucket = buckets.get(key)
    if (!bucket) continue
    groups.push({ key, label: bucket[0]?.display[column.id] || key, rows: bucket })
  }

  const blanks = buckets.get('')
  if (blanks && blanks.length > 0) {
    groups.push({ key: '', label: blankLabel(column), rows: blanks })
  }

  return groups
}

export function countRows(groups: RowGroup[]): number {
  return groups.reduce((total, group) => total + group.rows.length, 0)
}
