// A board shaped like a real one: nested workflow stages, several swimlanes, a
// disabled card type, and one custom field of every type the settings can describe -
// including an unlabelled one, which a board that never configured that slot leaves
// behind and which must not become a nameless column.

import type { BoardAttributes, TaskAttributes } from '../../src/kt/types'

export const board: BoardAttributes = {
  id: 77,
  name: 'Delivery',
  workflow_stages: [
    { id: 1, board_id: 77, parent_id: null, lft: 1, rgt: 2, position: 0, name: 'Backlog' },
    { id: 2, board_id: 77, parent_id: null, lft: 3, rgt: 8, position: 1, name: 'Development' },
    { id: 3, board_id: 77, parent_id: 2, lft: 4, rgt: 5, position: 0, name: 'In progress' },
    { id: 4, board_id: 77, parent_id: 2, lft: 6, rgt: 7, position: 1, name: 'Review' },
    { id: 5, board_id: 77, parent_id: null, lft: 9, rgt: 10, position: 2, name: 'Done' },
  ],
  swimlanes: [
    { id: 10, board_id: 77, position: 1, name: 'Platform' },
    { id: 11, board_id: 77, position: 0, name: 'Expedite' },
  ],
  card_types: [
    { id: 20, board_id: 77, name: 'Task', position: 0, is_default: true },
    { id: 21, board_id: 77, name: 'Bug', position: 1 },
    { id: 22, board_id: 77, name: 'Retired', position: 2, is_disabled: true },
  ],
  collaborators: [
    { id: 30, user_id: 30, name: 'Ada Lovelace', initials: 'AL' },
    { id: 31, user_id: 31, name: 'Alan Turing', initials: 'AT' },
  ],
  settings: {
    custom_field_1: { label: 'Customer', type: 'text' },
    custom_field_2: { label: 'Spec', type: 'link', width: 240 },
    custom_field_3: { label: 'Story points', type: 'number' },
    custom_field_4: { label: 'Team', type: 'select', options: 'Platform\nGrowth\nData' },
    custom_field_5: { label: 'Labels', type: 'select', options: ['red', 'green'], multiple: 1 },
    custom_field_6: { label: 'Kickoff', type: 'date' },
    custom_field_7: { label: 'Reviewer', type: 'user' },
    custom_field_8: { label: 'Notes', type: 'text', multiline: true },
    custom_field_9: { label: '', type: 'text' },
    unrelated_setting: { label: 'not a custom field' },
  },
}

export function task(overrides: Partial<TaskAttributes> = {}): TaskAttributes {
  return {
    id: 1,
    board_id: 77,
    swimlane_id: 10,
    workflow_stage_id: 3,
    card_type_id: 20,
    assigned_user_id: 30,
    name: 'Ship the thing',
    priority: 0,
    position: 0,
    tags: 'api,urgent',
    due_date: '2026-10-01',
    time_estimate: 7200,
    timers_total: 3600,
    subtasks_count: 4,
    subtasks_completed_count: 1,
    comments_count: 2,
    ...overrides,
  }
}
