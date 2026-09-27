// Turns task attributes into the flat row shape the table renders, sorts and filters.
// Pure: it takes plain attribute objects, not live models, so every downstream module
// (sorting, filtering, grouping) is testable without a browser or a KT global.

import type { TaskAttributes } from '../kt/types'
import type { ColumnDef } from './columns'
import {
  formatDate,
  formatDuration,
  formatNumber,
  parseMultiSelectValue,
  parseTags,
  priorityLabel,
  toNumber,
} from './format'

export interface Row {
  id: number
  /** Raw attribute values, keyed by column id - what editors read and write. */
  values: Record<string, unknown>
  /** Rendered text, keyed by column id - what sorting and filtering compare. */
  display: Record<string, string>
}

export function cellValue(task: TaskAttributes, column: ColumnDef): unknown {
  if (column.id === 'subtasks') {
    const total = toNumber(task.subtasks_count) ?? 0
    const done = toNumber(task.subtasks_completed_count) ?? 0
    return total === 0 ? null : done / total
  }
  if (!column.attribute) return null
  return task[column.attribute]
}

function optionLabel(column: ColumnDef, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const match = column.options?.find((o) => String(o.value) === String(value))
  return match ? match.label : String(value)
}

export function cellDisplay(
  task: TaskAttributes,
  column: ColumnDef,
  value: unknown = cellValue(task, column),
): string {
  switch (column.kind) {
    case 'progress': {
      const total = toNumber(task.subtasks_count) ?? 0
      if (total === 0) return ''
      const done = toNumber(task.subtasks_completed_count) ?? 0
      return `${done}/${total}`
    }
    case 'duration':
      return formatDuration(value)
    case 'date':
      return formatDate(value)
    case 'priority':
      return priorityLabel(value)
    case 'select':
    case 'user':
      return optionLabel(column, value)
    case 'multiselect':
      return parseMultiSelectValue(value)
        .map((v) => optionLabel(column, v))
        .join(', ')
    case 'tags':
      return parseTags(value).join(', ')
    case 'number':
    case 'count':
      return formatNumber(value)
    case 'link':
    case 'text':
    case 'multiline':
    default:
      return value === null || value === undefined ? '' : String(value)
  }
}

export function buildRow(task: TaskAttributes, columns: ColumnDef[]): Row {
  const values: Record<string, unknown> = {}
  const display: Record<string, string> = {}
  for (const column of columns) {
    const value = cellValue(task, column)
    values[column.id] = value
    display[column.id] = cellDisplay(task, column, value)
  }
  return { id: task.id, values, display }
}

export function buildRows(tasks: TaskAttributes[], columns: ColumnDef[]): Row[] {
  return tasks.map((task) => buildRow(task, columns))
}

/** Archived and deleted cards belong on the board's archive, not in the table. */
export function isVisibleTask(task: TaskAttributes): boolean {
  return !task.archived_at && !task.deleted_at
}
