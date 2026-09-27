import { describe, expect, it } from 'vitest'
import {
  buildColumns,
  cardTypeOptions,
  customFieldColumns,
  leafWorkflowStages,
  stageTone,
  swimlaneOptions,
  workflowStageOptions,
} from '../src/model/columns'
import { board } from './fixtures/board'

describe('workflow stages', () => {
  it('keeps only leaves, because a task never sits in a parent stage', () => {
    expect(leafWorkflowStages(board.workflow_stages).map((s) => s.name)).toEqual([
      'Backlog',
      'In progress',
      'Review',
      'Done',
    ])
  })

  it('qualifies nested stages with their parent', () => {
    expect(workflowStageOptions(board.workflow_stages).map((o) => o.label)).toEqual([
      'Backlog',
      'Development / In progress',
      'Development / Review',
      'Done',
    ])
  })

  it('reads the stage type from either the id or the string', () => {
    const byId = (id: number) => board.workflow_stages?.find((s) => s.id === id)
    expect(stageTone(byId(1)!, board.workflow_stages)).toBe('backlog')
    expect(stageTone(byId(2)!, board.workflow_stages)).toBe('in-progress')
    expect(stageTone(byId(4)!, board.workflow_stages)).toBe('wait')
    expect(stageTone(byId(5)!, board.workflow_stages)).toBe('done')
  })

  it('lets an untyped sub-column inherit its parent stage type', () => {
    const subColumn = board.workflow_stages?.find((s) => s.id === 3)
    expect(subColumn?.lane_type_id).toBeUndefined()
    expect(stageTone(subColumn!, board.workflow_stages)).toBe('in-progress')
  })

  it('has no tone for a stage the board never typed', () => {
    expect(stageTone({ ...board.workflow_stages![0]!, lane_type_id: undefined })).toBeUndefined()
  })

  it('carries the tone on each stage option, so a cell can paint itself', () => {
    expect(workflowStageOptions(board.workflow_stages).map((o) => o.tone)).toEqual([
      'backlog',
      'in-progress',
      'wait',
      'done',
    ])
  })
})

describe('other option sets', () => {
  it('orders swimlanes by position, not by declaration order', () => {
    expect(swimlaneOptions(board.swimlanes).map((o) => o.label)).toEqual([
      'Expedite',
      'Platform',
    ])
  })

  it('drops disabled card types', () => {
    expect(cardTypeOptions(board.card_types).map((o) => o.label)).toEqual(['Task', 'Bug'])
  })
})

describe('custom field columns', () => {
  const columns = customFieldColumns(board)

  it('maps each configured field to a typed column, in field order', () => {
    expect(columns.map((c) => [c.id, c.kind])).toEqual([
      ['custom_field_1', 'text'],
      ['custom_field_2', 'link'],
      ['custom_field_3', 'number'],
      ['custom_field_4', 'select'],
      ['custom_field_5', 'multiselect'],
      ['custom_field_6', 'date'],
      ['custom_field_7', 'user'],
      ['custom_field_8', 'multiline'],
    ])
  })

  it('skips unlabelled fields and non-custom-field settings', () => {
    expect(columns.map((c) => c.id)).not.toContain('custom_field_9')
    expect(columns.map((c) => c.id)).not.toContain('unrelated_setting')
  })

  it('reads select options from a newline-separated string', () => {
    const team = columns.find((c) => c.id === 'custom_field_4')
    expect(team?.options?.map((o) => o.label)).toEqual(['Platform', 'Growth', 'Data'])
  })

  it('reads select options from an array and honours the multiple flag', () => {
    const labels = columns.find((c) => c.id === 'custom_field_5')
    expect(labels?.options?.map((o) => o.label)).toEqual(['red', 'green'])
    expect(labels?.multiple).toBe(true)
  })

  it('gives user fields the board collaborators', () => {
    const reviewer = columns.find((c) => c.id === 'custom_field_7')
    expect(reviewer?.options?.map((o) => o.label)).toEqual([
      'Unassigned',
      'Ada Lovelace',
      'Alan Turing',
    ])
  })

  it('uses the configured width when the board sets one', () => {
    expect(columns.find((c) => c.id === 'custom_field_2')?.width).toBe(240)
  })
})

describe('buildColumns', () => {
  const columns = buildColumns(board)

  it('puts the fixed columns before the custom fields', () => {
    expect(columns[0]?.id).toBe('name')
    expect(columns.at(-1)?.id).toBe('custom_field_8')
  })

  it('marks only meaningful columns groupable', () => {
    expect(columns.filter((c) => c.groupable).map((c) => c.id)).toEqual([
      'workflow_stage_id',
      'swimlane_id',
      'assigned_user_id',
      'priority',
      'card_type_id',
      'custom_field_4',
      'custom_field_7',
    ])
  })

  it('does not offer multi-select fields for grouping', () => {
    // A card with two labels would belong in two groups at once.
    expect(columns.find((c) => c.id === 'custom_field_5')?.groupable).toBe(false)
  })

  it('never marks a derived column editable', () => {
    const derived = columns.filter((c) => c.attribute === null)
    expect(derived.length).toBeGreaterThan(0)
    expect(derived.every((c) => !c.editable)).toBe(true)
  })
})
