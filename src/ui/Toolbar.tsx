import { useEffect, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ColumnDef } from '../model/columns'

export interface ToolbarProps {
  boardName: string
  allColumns: ColumnDef[]
  visibleColumns: ColumnDef[]
  groupableColumns: ColumnDef[]
  groupBy: string | null
  search: string
  rowCount: number
  totalCount: number
  filtersShown: boolean
  filtersActive: boolean
  onGroupByChange: (columnId: string | null) => void
  onSearchChange: (value: string) => void
  onToggleColumn: (columnId: string) => void
  onToggleFilters: () => void
  onResetView: () => void
  onClose: () => void
}

function ColumnPicker({
  allColumns,
  visibleColumns,
  onToggleColumn,
}: Pick<ToolbarProps, 'allColumns' | 'visibleColumns' | 'onToggleColumn'>): JSX.Element {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLSpanElement | null>(null)
  const visibleIds = new Set(visibleColumns.map((c) => c.id))

  useEffect(() => {
    if (!open) return
    const onDocumentClick = (event: MouseEvent): void => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])

  return (
    <span class="ktv-popover-host" ref={hostRef}>
      <button type="button" class="ktv-button" onClick={() => setOpen((v) => !v)}>
        Columns ({visibleColumns.length})
      </button>
      {open && (
        <div class="ktv-popover">
          {allColumns.map((column) => (
            <label class="ktv-popover-item" key={column.id}>
              <input
                type="checkbox"
                checked={visibleIds.has(column.id)}
                onChange={() => onToggleColumn(column.id)}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
      )}
    </span>
  )
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  const {
    boardName,
    allColumns,
    visibleColumns,
    groupableColumns,
    groupBy,
    search,
    rowCount,
    totalCount,
    filtersShown,
    filtersActive,
    onGroupByChange,
    onSearchChange,
    onToggleColumn,
    onToggleFilters,
    onResetView,
    onClose,
  } = props

  return (
    <div class="ktv-toolbar">
      <strong>{boardName}</strong>

      <span class="ktv-toolbar-group">
        <span class="ktv-toolbar-label">Group by</span>
        <select
          class="ktv-select"
          value={groupBy ?? ''}
          onChange={(event) => {
            const value = (event.target as HTMLSelectElement).value
            onGroupByChange(value === '' ? null : value)
          }}
        >
          <option value="">Nothing</option>
          {groupableColumns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.label}
            </option>
          ))}
        </select>
      </span>

      <input
        class="ktv-input ktv-search"
        type="search"
        placeholder="Search cards…"
        value={search}
        onInput={(event) => onSearchChange((event.target as HTMLInputElement).value)}
      />

      <button
        type="button"
        class={`ktv-button${filtersShown || filtersActive ? ' ktv-button-active' : ''}`}
        onClick={onToggleFilters}
        title="Show a filter box under each column heading"
      >
        Filters{filtersActive ? ' \u2022' : ''}
      </button>

      <ColumnPicker
        allColumns={allColumns}
        visibleColumns={visibleColumns}
        onToggleColumn={onToggleColumn}
      />

      <span class="ktv-count">
        {rowCount === totalCount
          ? `${totalCount} card${totalCount === 1 ? '' : 's'}`
          : `${rowCount} of ${totalCount} cards`}
      </span>

      <span class="ktv-toolbar-spacer" />

      <button type="button" class="ktv-button" onClick={onResetView}>
        Reset view
      </button>
      <button type="button" class="ktv-button ktv-button-primary" onClick={onClose}>
        Back to board
      </button>
    </div>
  )
}
