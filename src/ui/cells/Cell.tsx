import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ColumnDef } from '../../model/columns'
import type { Row } from '../../model/rows'
import { editorInitialValue, parseCellInput } from '../../model/values'
import { parseTags } from '../../model/format'
import { notifyError } from '../../kt/env'

export interface CellProps {
  column: ColumnDef
  row: Row
  /** False when the column is derived, or the user lacks the permission for it. */
  editable: boolean
  width: number
  /** Resolves true when the value was accepted and saved. */
  onCommit: (column: ColumnDef, value: unknown) => Promise<boolean>
  onOpenTask: (taskId: number) => void
}

/** Kinds edited with a dropdown rather than free text. */
const SELECT_KINDS = new Set(['select', 'user', 'priority'])

function ReadView({
  column,
  row,
  onOpenTask,
}: {
  column: ColumnDef
  row: Row
  onOpenTask: (taskId: number) => void
}): JSX.Element {
  const display = row.display[column.id] ?? ''

  if (column.id === 'name') {
    return (
      <span class="ktv-name">
        <span class="ktv-name-text">{display}</span>
        <button
          type="button"
          class="ktv-open"
          title="Open card"
          onClick={(event) => {
            event.stopPropagation()
            onOpenTask(row.id)
          }}
        >
          &#8599;
        </button>
      </span>
    )
  }

  if (column.kind === 'progress') {
    const ratio = typeof row.values[column.id] === 'number' ? (row.values[column.id] as number) : null
    if (ratio === null) return <span />
    return (
      <span class="ktv-progress-wrap">
        <span class="ktv-progress">
          <span class="ktv-progress-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
        </span>
        <span class="ktv-progress-text">{display}</span>
      </span>
    )
  }

  if (column.kind === 'link' && display !== '') {
    return (
      <a class="ktv-link" href={display} target="_blank" rel="noopener noreferrer">
        {display}
      </a>
    )
  }

  if ((column.kind === 'tags' || column.kind === 'multiselect') && display !== '') {
    return (
      <span>
        {parseTags(display.replace(/, /g, ',')).map((tag) => (
          <span class="ktv-tag" key={tag}>
            {tag}
          </span>
        ))}
      </span>
    )
  }

  return <span>{display}</span>
}

export function Cell({
  column,
  row,
  editable,
  width,
  onCommit,
  onOpenTask,
}: CellProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) inputRef.current.select()
    }
  }, [editing])

  const startEditing = (): void => {
    if (!editable || saving) return
    setDraft(editorInitialValue(column, row.values[column.id], row.display[column.id] ?? ''))
    setEditing(true)
  }

  const cancel = (): void => {
    setEditing(false)
    setDraft('')
  }

  const commit = async (raw: string): Promise<void> => {
    const parsed = parseCellInput(column, raw)
    if (!parsed.ok) {
      notifyError(column.label, parsed.message)
      cancel()
      return
    }
    setEditing(false)
    setSaving(true)
    try {
      await onCommit(column, parsed.value)
    } finally {
      setSaving(false)
    }
  }

  const classes = [
    'ktv-cell',
    editable ? '' : 'ktv-cell-readonly',
    editing ? 'ktv-cell-editing' : '',
    saving ? 'ktv-cell-saving' : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (!editing) {
    return (
      <div
        class={classes}
        style={{ width: `${width}px` }}
        onDblClick={startEditing}
        title={row.display[column.id] || undefined}
      >
        <span class="ktv-cell-value" onClick={editable ? startEditing : undefined}>
          <ReadView column={column} row={row} onOpenTask={onOpenTask} />
        </span>
      </div>
    )
  }

  if (SELECT_KINDS.has(column.kind)) {
    return (
      <div class={classes} style={{ width: `${width}px` }}>
        <select
          class="ktv-cell-editor ktv-select"
          ref={(el) => {
            inputRef.current = el
          }}
          value={draft}
          onChange={(event) => void commit((event.target as HTMLSelectElement).value)}
          onBlur={cancel}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
        >
          <option value="">&mdash;</option>
          {(column.options ?? []).map((option) => (
            <option
              key={String(option.value)}
              value={option.value === null ? '' : String(option.value)}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (column.kind === 'multiline') {
    return (
      <div class={classes} style={{ width: `${width}px` }}>
        <textarea
          class="ktv-cell-editor"
          rows={2}
          ref={(el) => {
            inputRef.current = el
          }}
          value={draft}
          onInput={(event) => setDraft((event.target as HTMLTextAreaElement).value)}
          onBlur={() => void commit(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
            // Enter inserts a newline here; Ctrl/Cmd+Enter commits.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void commit(draft)
          }}
        />
      </div>
    )
  }

  return (
    <div class={classes} style={{ width: `${width}px` }}>
      <input
        class="ktv-cell-editor"
        type={column.kind === 'date' ? 'date' : 'text'}
        ref={(el) => {
            inputRef.current = el
          }}
        value={draft}
        onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
        onBlur={() => void commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') cancel()
          if (event.key === 'Enter') void commit((event.target as HTMLInputElement).value)
        }}
      />
    </div>
  )
}
