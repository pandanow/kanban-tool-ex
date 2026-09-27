import { describe, expect, it } from 'vitest'
import { buildColumns, findColumn } from '../src/model/columns'
import { buildRows } from '../src/model/rows'
import { countRows, groupRows } from '../src/model/grouping'
import { board, task } from './fixtures/board'

const columns = buildColumns(board)
const col = (id: string) => findColumn(columns, id)

const rows = buildRows(
  [
    task({ id: 1, workflow_stage_id: 5, assigned_user_id: 30 }),
    task({ id: 2, workflow_stage_id: 1, assigned_user_id: null }),
    task({ id: 3, workflow_stage_id: 3, assigned_user_id: 31 }),
    task({ id: 4, workflow_stage_id: 1, assigned_user_id: 30 }),
  ],
  columns,
)

describe('groupRows', () => {
  it('orders groups the way the board orders its stages', () => {
    const groups = groupRows(rows, col('workflow_stage_id'))
    expect(groups.map((g) => g.label)).toEqual([
      'Backlog',
      'Development / In progress',
      'Done',
    ])
    expect(groups[0]?.rows.map((r) => r.id)).toEqual([2, 4])
  })

  it('drops stages that hold no cards rather than showing empty sections', () => {
    const groups = groupRows(rows, col('workflow_stage_id'))
    expect(groups.map((g) => g.label)).not.toContain('Development / Review')
  })

  it('puts the blank group last, with a field-specific label', () => {
    const groups = groupRows(rows, col('assigned_user_id'))
    expect(groups.at(-1)?.label).toBe('Unassigned')
    expect(groups.at(-1)?.rows.map((row) => row.id)).toEqual([2])
  })

  it('still groups a value whose option has gone away', () => {
    const orphaned = buildRows([task({ id: 5, assigned_user_id: 999 })], columns)
    const groups = groupRows(orphaned, col('assigned_user_id'))
    expect(groups.map((g) => g.label)).toEqual(['999'])
  })

  it('returns one unlabelled group when grouping is off', () => {
    const groups = groupRows(rows, undefined)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows).toHaveLength(4)
  })

  it('never loses or duplicates a row', () => {
    for (const id of ['workflow_stage_id', 'assigned_user_id', 'priority', 'card_type_id']) {
      const groups = groupRows(rows, col(id))
      expect(countRows(groups)).toBe(rows.length)
      const seen = groups.flatMap((g) => g.rows.map((r) => r.id))
      expect(new Set(seen).size).toBe(rows.length)
    }
  })
})
