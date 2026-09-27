import { describe, expect, it } from 'vitest'
import { buildColumns, findColumn } from '../src/model/columns'
import { buildRows } from '../src/model/rows'
import { sortRows } from '../src/model/sorting'
import { board, task } from './fixtures/board'

const columns = buildColumns(board)
const col = (id: string) => findColumn(columns, id)

const rows = buildRows(
  [
    task({ id: 1, name: 'Beta', time_estimate: 3600, due_date: '2026-12-01', priority: 1 }),
    task({ id: 2, name: 'alpha', time_estimate: 36000, due_date: null, priority: -1 }),
    task({ id: 3, name: 'Gamma', time_estimate: null, due_date: '2026-02-01', priority: 0 }),
  ],
  columns,
)

const ids = (list: ReturnType<typeof buildRows>) => list.map((r) => r.id)

describe('sortRows', () => {
  it('sorts text case-insensitively', () => {
    expect(ids(sortRows(rows, col('name'), 'asc'))).toEqual([2, 1, 3])
  })

  it('sorts durations numerically, not as the text shown', () => {
    // "10h" sorts before "1h" as a string; as seconds it must not.
    expect(ids(sortRows(rows, col('time_estimate'), 'asc'))).toEqual([1, 2, 3])
  })

  it('sorts dates chronologically', () => {
    expect(ids(sortRows(rows, col('due_date'), 'asc'))).toEqual([3, 1, 2])
  })

  it('sorts priority by its underlying number', () => {
    expect(ids(sortRows(rows, col('priority'), 'asc'))).toEqual([2, 3, 1])
  })

  it('keeps blanks last in both directions', () => {
    expect(ids(sortRows(rows, col('due_date'), 'asc')).at(-1)).toBe(2)
    expect(ids(sortRows(rows, col('due_date'), 'desc')).at(-1)).toBe(2)
  })

  it('reverses only the rows that have a value', () => {
    expect(ids(sortRows(rows, col('time_estimate'), 'desc'))).toEqual([2, 1, 3])
  })

  it('is stable on ties, falling back to id', () => {
    const tied = buildRows(
      [task({ id: 9, priority: 0 }), task({ id: 4, priority: 0 }), task({ id: 7, priority: 0 })],
      columns,
    )
    expect(ids(sortRows(tied, col('priority'), 'asc'))).toEqual([4, 7, 9])
  })

  it('leaves the order alone when no column is sorted', () => {
    expect(ids(sortRows(rows, undefined, 'asc'))).toEqual([1, 2, 3])
  })

  it('does not mutate the input', () => {
    const before = ids(rows)
    sortRows(rows, col('name'), 'desc')
    expect(ids(rows)).toEqual(before)
  })
})
