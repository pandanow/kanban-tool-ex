// Turns what the user typed into the value Kanban Tool stores, per column kind.
//
// Kept out of the components so the rules are testable on their own: this is where a
// bad duration or a malformed date is caught, before we send anything to the server.

import type { ColumnDef } from './columns'
import {
  parseDate,
  parseDuration,
  parsePriority,
  parseTags,
  serializeMultiSelectValue,
  serializeTags,
  toNumber,
} from './format'

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string }

export function parseCellInput(column: ColumnDef, raw: string): ParseResult {
  const text = raw.trim()

  switch (column.kind) {
    case 'text':
    case 'multiline':
      // A card with no name is not a state the board can represent.
      if (column.id === 'name' && text === '') {
        return { ok: false, message: 'A card needs a name.' }
      }
      return { ok: true, value: column.kind === 'multiline' ? raw : text }

    case 'link':
      return { ok: true, value: text === '' ? null : text }

    case 'number': {
      if (text === '') return { ok: true, value: null }
      const n = toNumber(text)
      return n === null
        ? { ok: false, message: `"${raw}" is not a number.` }
        : { ok: true, value: n }
    }

    case 'duration': {
      if (text === '') return { ok: true, value: null }
      const seconds = parseDuration(text)
      return seconds === null
        ? { ok: false, message: `"${raw}" is not a duration. Try "2h 30m" or "90".` }
        : { ok: true, value: seconds }
    }

    case 'date': {
      if (text === '') return { ok: true, value: null }
      const date = parseDate(text)
      return date === null
        ? { ok: false, message: `"${raw}" is not a date. Use YYYY-MM-DD.` }
        : { ok: true, value: date }
    }

    case 'priority': {
      if (text === '') return { ok: true, value: 0 }
      const priority = parsePriority(text)
      return priority === null
        ? { ok: false, message: `"${raw}" is not a priority.` }
        : { ok: true, value: priority }
    }

    case 'tags':
      return { ok: true, value: serializeTags(parseTags(text)) }

    case 'multiselect':
      return { ok: true, value: serializeMultiSelectValue(parseTags(text)) }

    case 'select':
    case 'user': {
      if (text === '') return { ok: true, value: null }
      const option = column.options?.find(
        (o) => String(o.value) === text || o.label === raw.trim(),
      )
      if (!option) return { ok: false, message: `"${raw}" is not an option for ${column.label}.` }
      return { ok: true, value: option.value }
    }

    case 'progress':
    case 'count':
    default:
      return { ok: false, message: `${column.label} cannot be edited here.` }
  }
}

/** The string an editor should open with for a given raw value. */
export function editorInitialValue(column: ColumnDef, value: unknown, display: string): string {
  switch (column.kind) {
    case 'select':
    case 'user':
    case 'priority':
      return value === null || value === undefined ? '' : String(value)
    case 'multiline':
    case 'text':
    case 'link':
      return value === null || value === undefined ? '' : String(value)
    default:
      return display
  }
}
