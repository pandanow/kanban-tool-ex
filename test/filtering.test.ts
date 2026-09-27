import { describe, expect, it } from 'vitest'
import { buildColumns } from '../src/model/columns'
import { buildRows } from '../src/model/rows'
import {
  EMPTY_FILTER,
  EMPTY_TOKEN,
  NOT_EMPTY_TOKEN,
  filterRows,
  hasActiveFilter,
} from '../src/model/filtering'
import { board, task } from './fixtures/board'

const columns = buildColumns(board)
const visible = columns.filter((c) => !c.defaultHidden)

const rows = buildRows(
  [
    task({ id: 1, name: 'Fix login', assigned_user_id: 30, priority: 1, due_date: '2026-10-01' }),
    task({ id: 2, name: 'Write docs', assigned_user_id: 31, priority: 0, due_date: null }),
    task({ id: 3, name: 'Refactor login guard', assigned_user_id: null, priority: -1, due_date: null }),
  ],
  columns,
)

const ids = (filter: Parameters<typeof filterRows>[1]) =>
  filterRows(rows, filter, visible).map((r) => r.id)

describe('filterRows', () => {
  it('matches a search against any visible column', () => {
    expect(ids({ columns: {}, search: 'login' })).toEqual([1, 3])
  })

  it('searches what the cell shows, not the stored id', () => {
    expect(ids({ columns: {}, search: 'Ada' })).toEqual([1])
    expect(ids({ columns: {}, search: 'High' })).toEqual([1])
  })

  it('is case-insensitive', () => {
    expect(ids({ columns: {}, search: 'LOGIN' })).toEqual([1, 3])
  })

  it('ands multiple column filters together', () => {
    expect(ids({ columns: { name: 'login', priority: 'high' }, search: '' })).toEqual([1])
  })

  it('finds blanks and non-blanks', () => {
    expect(ids({ columns: { due_date: EMPTY_TOKEN }, search: '' })).toEqual([2, 3])
    expect(ids({ columns: { due_date: NOT_EMPTY_TOKEN }, search: '' })).toEqual([1])
    expect(ids({ columns: { assigned_user_id: EMPTY_TOKEN }, search: '' })).toEqual([3])
  })

  it('ignores blank filter terms', () => {
    expect(ids({ columns: { name: '   ' }, search: '' })).toEqual([1, 2, 3])
    expect(ids(EMPTY_FILTER)).toEqual([1, 2, 3])
  })

  it('reports whether anything is filtering', () => {
    expect(hasActiveFilter(EMPTY_FILTER)).toBe(false)
    expect(hasActiveFilter({ columns: {}, search: 'x' })).toBe(true)
    expect(hasActiveFilter({ columns: { name: ' ' }, search: '' })).toBe(false)
  })
})
