import { describe, expect, it } from 'vitest'
import { buildColumns, findColumn } from '../src/model/columns'
import { buildRow, isVisibleTask } from '../src/model/rows'
import { board, task } from './fixtures/board'

const columns = buildColumns(board)
const row = buildRow(
  task({
    custom_field_1: 'Acme',
    custom_field_3: 5,
    custom_field_4: 'Growth',
    custom_field_5: 'red,green',
    custom_field_6: '2026-11-02',
    custom_field_7: 31,
  }),
  columns,
)

describe('cell display', () => {
  it('resolves ids to the names a person recognises', () => {
    expect(row.display['workflow_stage_id']).toBe('Development / In progress')
    expect(row.display['swimlane_id']).toBe('Platform')
    expect(row.display['assigned_user_id']).toBe('Ada Lovelace')
    expect(row.display['card_type_id']).toBe('Task')
    expect(row.display['custom_field_7']).toBe('Alan Turing')
  })

  it('formats durations and dates', () => {
    expect(row.display['time_estimate']).toBe('2h')
    expect(row.display['timers_total']).toBe('1h')
    expect(row.display['due_date']).toBe('2026-10-01')
    expect(row.display['custom_field_6']).toBe('2026-11-02')
  })

  it('renders multi-value fields as readable lists', () => {
    expect(row.display['tags']).toBe('api, urgent')
    expect(row.display['custom_field_5']).toBe('red, green')
  })

  it('derives checklist progress from the two counts', () => {
    expect(row.display['subtasks']).toBe('1/4')
    expect(row.values['subtasks']).toBeCloseTo(0.25)
  })

  it('leaves a task with no checklist blank rather than showing 0/0', () => {
    const none = buildRow(task({ subtasks_count: 0, subtasks_completed_count: 0 }), columns)
    expect(none.display['subtasks']).toBe('')
    expect(none.values['subtasks']).toBeNull()
  })

  it('keeps the raw value for editing alongside the display text', () => {
    expect(row.values['assigned_user_id']).toBe(30)
    expect(row.display['assigned_user_id']).toBe('Ada Lovelace')
  })

  it('shows a value with no matching option rather than hiding it', () => {
    const orphan = buildRow(task({ assigned_user_id: 999 }), columns)
    expect(orphan.display['assigned_user_id']).toBe('999')
  })
})

describe('visibility', () => {
  it('excludes archived and deleted cards', () => {
    expect(isVisibleTask(task())).toBe(true)
    expect(isVisibleTask(task({ archived_at: '2026-01-01' }))).toBe(false)
    expect(isVisibleTask(task({ deleted_at: '2026-01-01' }))).toBe(false)
  })
})

describe('column lookup', () => {
  it('finds by id', () => {
    expect(findColumn(columns, 'due_date')?.label).toBe('Due date')
    expect(findColumn(columns, 'nope')).toBeUndefined()
  })
})
