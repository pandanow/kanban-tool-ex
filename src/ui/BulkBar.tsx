import { useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ColumnDef } from '../model/columns'
import { parseCellInput } from '../model/values'
import { notifyError } from '../kt/env'

export interface BulkBarProps {
  selectedCount: number
  columns: ColumnDef[]
  onApply: (column: ColumnDef, value: unknown) => void
  onClear: () => void
}

/** Kinds that make sense to set to one value across many cards. */
const BULK_KINDS = new Set([
  'select',
  'user',
  'priority',
  'date',
  'text',
  'number',
  'duration',
  'tags',
])

/**
 * Giving every selected card the same name is destructive and essentially never
 * intended, so the card name is not offered here even though it is editable per cell.
 */
const NOT_BULK_EDITABLE = new Set(['name'])

/** Attributes a card cannot be without - clearing these across a selection is not offered. */
const REQUIRED_ATTRIBUTES = new Set([
  'workflow_stage_id',
  'swimlane_id',
  'card_type_id',
  'priority',
])

export function bulkEditableColumns(columns: ColumnDef[]): ColumnDef[] {
  return columns.filter(
    (c) =>
      c.editable &&
      c.attribute !== null &&
      !NOT_BULK_EDITABLE.has(c.id) &&
      BULK_KINDS.has(c.kind),
  )
}

export function BulkBar({
  selectedCount,
  columns,
  onApply,
  onClear,
}: BulkBarProps): JSX.Element {
  const available = bulkEditableColumns(columns)
  const [columnId, setColumnId] = useState(available[0]?.id ?? '')
  const [raw, setRaw] = useState('')

  const column = available.find((c) => c.id === columnId) ?? available[0]
  const usesSelect = column && (column.kind === 'select' || column.kind === 'user' || column.kind === 'priority')
  const needsValue =
    column?.attribute != null && REQUIRED_ATTRIBUTES.has(column.attribute) && raw.trim() === ''

  const apply = (): void => {
    if (!column || needsValue) return
    const parsed = parseCellInput(column, raw)
    if (!parsed.ok) {
      notifyError(column.label, parsed.message)
      return
    }
    onApply(column, parsed.value)
  }

  return (
    <div class="ktv-bulkbar">
      <strong>
        {selectedCount} card{selectedCount === 1 ? '' : 's'} selected
      </strong>
      <span class="ktv-toolbar-label">Set</span>
      <select
        class="ktv-select"
        value={column?.id ?? ''}
        onChange={(event) => {
          setColumnId((event.target as HTMLSelectElement).value)
          setRaw('')
        }}
      >
        {available.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <span class="ktv-toolbar-label">to</span>
      {usesSelect ? (
        <select
          class="ktv-select"
          value={raw}
          onChange={(event) => setRaw((event.target as HTMLSelectElement).value)}
        >
          <option value="">&mdash;</option>
          {(column?.options ?? []).map((option) => (
            <option key={String(option.value)} value={option.value === null ? '' : String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          class="ktv-input"
          type={column?.kind === 'date' ? 'date' : 'text'}
          value={raw}
          onInput={(event) => setRaw((event.target as HTMLInputElement).value)}
        />
      )}
      <button
        type="button"
        class="ktv-button ktv-button-primary"
        disabled={needsValue}
        title={needsValue ? `${column?.label} cannot be cleared` : undefined}
        onClick={apply}
      >
        Apply
      </button>
      <span class="ktv-toolbar-spacer" />
      <button type="button" class="ktv-button" onClick={onClear}>
        Clear selection
      </button>
    </div>
  )
}
