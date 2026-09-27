import { describe, expect, it } from 'vitest'
import { buildColumns, findColumn, type ColumnDef } from '../src/model/columns'
import { parseCellInput } from '../src/model/values'
import { board } from './fixtures/board'

const columns = buildColumns(board)
const column = (id: string): ColumnDef => {
  const found = findColumn(columns, id)
  if (!found) throw new Error(`no column ${id}`)
  return found
}

describe('parseCellInput', () => {
  it('refuses to blank a card name', () => {
    const result = parseCellInput(column('name'), '   ')
    expect(result.ok).toBe(false)
  })

  it('trims text but keeps multiline content verbatim', () => {
    expect(parseCellInput(column('custom_field_1'), '  Acme  ')).toEqual({
      ok: true,
      value: 'Acme',
    })
    expect(parseCellInput(column('custom_field_8'), 'line one\nline two')).toEqual({
      ok: true,
      value: 'line one\nline two',
    })
  })

  it('clears a value when the cell is emptied', () => {
    expect(parseCellInput(column('due_date'), '')).toEqual({ ok: true, value: null })
    expect(parseCellInput(column('time_estimate'), '')).toEqual({ ok: true, value: null })
    expect(parseCellInput(column('assigned_user_id'), '')).toEqual({ ok: true, value: null })
  })

  it('converts a duration to seconds', () => {
    expect(parseCellInput(column('time_estimate'), '2h 30m')).toEqual({ ok: true, value: 9000 })
  })

  it('rejects an unparseable duration instead of saving zero', () => {
    const result = parseCellInput(column('time_estimate'), 'ages')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('2h 30m')
  })

  it('rejects a mis-formatted date', () => {
    expect(parseCellInput(column('due_date'), '01/10/2026').ok).toBe(false)
  })

  it('accepts a select value by id or by label', () => {
    expect(parseCellInput(column('assigned_user_id'), '31')).toEqual({ ok: true, value: 31 })
    expect(parseCellInput(column('assigned_user_id'), 'Alan Turing')).toEqual({
      ok: true,
      value: 31,
    })
  })

  it('rejects a select value that is not an option', () => {
    expect(parseCellInput(column('custom_field_4'), 'Legal').ok).toBe(false)
  })

  it('normalises tags to the stored comma form', () => {
    expect(parseCellInput(column('tags'), ' api , urgent , api ')).toEqual({
      ok: true,
      value: 'api,urgent',
    })
  })

  it('will not edit a derived column', () => {
    expect(parseCellInput(column('subtasks'), '2/4').ok).toBe(false)
    expect(parseCellInput(column('comments_count'), '3').ok).toBe(false)
  })
})
