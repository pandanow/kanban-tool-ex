// Derives the table's columns for a given board.
//
// Two sources: a fixed set of task attributes that exist on every board, and one column
// per configured custom field, typed from that board's `settings.custom_field_N`
// metadata. Nothing here touches the DOM or the KT global - given a board's attributes
// it returns plain data, which is what makes it unit-testable.

import type { BoardAttributes, CardType, Swimlane, WorkflowStage } from '../kt/types'
import { parseSelectOptions, toBoolean, PRIORITIES } from './format'

export type ColumnKind =
  | 'text'
  | 'multiline'
  | 'number'
  | 'duration'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'user'
  | 'link'
  | 'tags'
  | 'priority'
  | 'progress'
  | 'count'

export interface SelectOption {
  value: string | number | null
  label: string
}

export interface ColumnDef {
  /** Stable id used in saved view state. */
  id: string
  /** Task attribute this column reads and writes; null for derived columns. */
  attribute: string | null
  label: string
  kind: ColumnKind
  /** Structurally editable. Permission checks are applied separately, at render time. */
  editable: boolean
  options?: SelectOption[]
  multiple?: boolean
  multiline?: boolean
  width: number
  groupable: boolean
  /** Present in the column picker but off until the user turns it on. */
  defaultHidden: boolean
}

const DEFAULT_WIDTHS: Record<ColumnKind, number> = {
  text: 220,
  multiline: 280,
  number: 110,
  duration: 110,
  date: 130,
  select: 160,
  multiselect: 200,
  user: 160,
  link: 200,
  tags: 200,
  priority: 110,
  progress: 130,
  count: 90,
}

const CUSTOM_FIELD_KEY = /^custom_field_(\d+)$/

/** Stages can nest; tasks only ever sit in a leaf stage. */
export function leafWorkflowStages(stages: WorkflowStage[] = []): WorkflowStage[] {
  const parentIds = new Set(
    stages.map((s) => s.parent_id).filter((id): id is number => id != null),
  )
  return stages
    .filter((s) => !parentIds.has(s.id))
    .slice()
    .sort((a, b) => (a.lft ?? a.position ?? 0) - (b.lft ?? b.position ?? 0))
}

/** "Development / In progress" reads better than a bare leaf name. */
export function workflowStageLabel(
  stage: WorkflowStage,
  stages: WorkflowStage[] = [],
): string {
  const byId = new Map(stages.map((s) => [s.id, s]))
  const parts: string[] = [stage.name]
  let current: WorkflowStage | undefined = stage
  const guard = new Set<number>([stage.id])
  while (current?.parent_id != null) {
    const parent: WorkflowStage | undefined = byId.get(current.parent_id)
    if (!parent || guard.has(parent.id)) break
    guard.add(parent.id)
    parts.unshift(parent.name)
    current = parent
  }
  return parts.join(' / ')
}

export function workflowStageOptions(stages: WorkflowStage[] = []): SelectOption[] {
  return leafWorkflowStages(stages).map((stage) => ({
    value: stage.id,
    label: workflowStageLabel(stage, stages),
  }))
}

export function swimlaneOptions(swimlanes: Swimlane[] = []): SelectOption[] {
  return swimlanes
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((lane) => ({ value: lane.id, label: lane.name }))
}

export function cardTypeOptions(cardTypes: CardType[] = []): SelectOption[] {
  return cardTypes
    .filter((type) => !type.is_disabled)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((type) => ({ value: type.id, label: type.name }))
}

export function collaboratorOptions(board: BoardAttributes): SelectOption[] {
  const people = board.collaborators ?? []
  return [
    { value: null, label: 'Unassigned' },
    ...people.map((person) => ({
      value: person.user_id ?? person.id,
      label: person.name ?? person.initials ?? person.email ?? `User ${person.id}`,
    })),
  ]
}

function fixedColumns(board: BoardAttributes): ColumnDef[] {
  const priorityOptions: SelectOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: p.label,
  }))

  const column = (
    def: Omit<ColumnDef, 'width' | 'defaultHidden' | 'groupable'> &
      Partial<Pick<ColumnDef, 'width' | 'defaultHidden' | 'groupable'>>,
  ): ColumnDef => ({
    width: DEFAULT_WIDTHS[def.kind],
    defaultHidden: false,
    groupable: false,
    ...def,
  })

  return [
    column({
      id: 'name',
      attribute: 'name',
      label: 'Card',
      kind: 'text',
      editable: true,
      width: 340,
    }),
    column({
      id: 'workflow_stage_id',
      attribute: 'workflow_stage_id',
      label: 'Stage',
      kind: 'select',
      editable: true,
      options: workflowStageOptions(board.workflow_stages),
      groupable: true,
      width: 180,
    }),
    column({
      id: 'swimlane_id',
      attribute: 'swimlane_id',
      label: 'Swimlane',
      kind: 'select',
      editable: true,
      options: swimlaneOptions(board.swimlanes),
      groupable: true,
    }),
    column({
      id: 'assigned_user_id',
      attribute: 'assigned_user_id',
      label: 'Assignee',
      kind: 'user',
      editable: true,
      options: collaboratorOptions(board),
      groupable: true,
    }),
    column({
      id: 'due_date',
      attribute: 'due_date',
      label: 'Due date',
      kind: 'date',
      editable: true,
    }),
    column({
      id: 'priority',
      attribute: 'priority',
      label: 'Priority',
      kind: 'priority',
      editable: true,
      options: priorityOptions,
      groupable: true,
    }),
    column({
      id: 'card_type_id',
      attribute: 'card_type_id',
      label: 'Card type',
      kind: 'select',
      editable: true,
      options: cardTypeOptions(board.card_types),
      groupable: true,
    }),
    column({ id: 'tags', attribute: 'tags', label: 'Tags', kind: 'tags', editable: true }),
    column({
      id: 'time_estimate',
      attribute: 'time_estimate',
      label: 'Estimate',
      kind: 'duration',
      editable: true,
    }),
    column({
      id: 'timers_total',
      attribute: 'timers_total',
      label: 'Tracked',
      kind: 'duration',
      editable: false,
    }),
    column({
      id: 'subtasks',
      attribute: null,
      label: 'Checklist',
      kind: 'progress',
      editable: false,
    }),
    column({
      id: 'comments_count',
      attribute: 'comments_count',
      label: 'Comments',
      kind: 'count',
      editable: false,
    }),
    column({
      id: 'size_estimate',
      attribute: 'size_estimate',
      label: 'Size',
      kind: 'number',
      editable: true,
      defaultHidden: true,
    }),
    column({
      id: 'attachments_count',
      attribute: 'attachments_count',
      label: 'Files',
      kind: 'count',
      editable: false,
      defaultHidden: true,
    }),
    column({
      id: 'block_reason',
      attribute: 'block_reason',
      label: 'Blocked',
      kind: 'text',
      editable: false,
      defaultHidden: true,
    }),
    column({
      id: 'external_id',
      attribute: 'external_id',
      label: 'External id',
      kind: 'text',
      editable: false,
      defaultHidden: true,
    }),
    column({
      id: 'created_at',
      attribute: 'created_at',
      label: 'Created',
      kind: 'date',
      editable: false,
      defaultHidden: true,
    }),
    column({
      id: 'updated_at',
      attribute: 'updated_at',
      label: 'Updated',
      kind: 'date',
      editable: false,
      defaultHidden: true,
    }),
  ]
}

function customFieldKind(
  type: string | undefined,
  multiple: boolean,
  multiline: boolean,
): ColumnKind {
  switch (type) {
    case 'link':
      return 'link'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'user':
      return 'user'
    case 'select':
      return multiple ? 'multiselect' : 'select'
    case 'text':
    default:
      return multiline ? 'multiline' : 'text'
  }
}

export function customFieldColumns(board: BoardAttributes): ColumnDef[] {
  const settings = board.settings ?? {}
  const entries = Object.keys(settings)
    .map((key) => ({ key, match: CUSTOM_FIELD_KEY.exec(key) }))
    .filter((e): e is { key: string; match: RegExpExecArray } => e.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))

  const columns: ColumnDef[] = []
  for (const { key } of entries) {
    const setting = settings[key] as
      | { label?: string; type?: string; width?: unknown; options?: unknown; multiple?: unknown; multiline?: unknown }
      | undefined
    if (!setting) continue
    const label = (setting.label ?? '').trim()
    // An unlabelled custom field is one the board has not configured - showing it would
    // add a nameless column to every board that never set it up.
    if (label === '') continue

    const multiple = toBoolean(setting.multiple)
    const multiline = toBoolean(setting.multiline)
    const kind = customFieldKind(setting.type, multiple, multiline)
    const width = Number(setting.width)

    columns.push({
      id: key,
      attribute: key,
      label,
      kind,
      editable: true,
      options:
        kind === 'select' || kind === 'multiselect'
          ? parseSelectOptions(setting.options).map((o) => ({ value: o, label: o }))
          : kind === 'user'
            ? collaboratorOptions(board)
            : undefined,
      multiple,
      multiline,
      width: Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTHS[kind],
      // Multi-select is deliberately excluded: a card with two values would have to
      // appear in two groups at once.
      groupable: kind === 'select' || kind === 'user',
      defaultHidden: false,
    })
  }
  return columns
}

export function buildColumns(board: BoardAttributes): ColumnDef[] {
  return [...fixedColumns(board), ...customFieldColumns(board)]
}

export function groupableColumns(columns: ColumnDef[]): ColumnDef[] {
  return columns.filter((c) => c.groupable)
}

export function findColumn(columns: ColumnDef[], id: string): ColumnDef | undefined {
  return columns.find((c) => c.id === id)
}
