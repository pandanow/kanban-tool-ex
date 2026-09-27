import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { ColumnDef } from '../model/columns'
import type { RowGroup } from '../model/grouping'
import type { Row } from '../model/rows'
import type { SortState } from '../model/sorting'
import type { ColumnFilter } from '../model/filtering'
import { selectedValues } from '../model/filtering'
import { Cell } from './cells/Cell'
import { ChecklistFilter } from './ChecklistFilter'

/** Rows and group headers are the same fixed height - see the note in styles.css. */
export const ITEM_HEIGHT = 31
const OVERSCAN = 8
const GUTTER_WIDTH = 34

type FlatItem =
  | { kind: 'group'; group: RowGroup; index: number }
  | { kind: 'row'; row: Row }

export interface TableProps {
  columns: ColumnDef[]
  groups: RowGroup[]
  grouped: boolean
  collapsed: Set<string>
  selected: Set<number>
  sort: SortState | null
  filters: Record<string, ColumnFilter>
  showFilters: boolean
  columnWidth: (column: ColumnDef) => number
  isEditable: (column: ColumnDef) => boolean
  onToggleGroup: (key: string) => void
  onToggleSort: (columnId: string) => void
  onFilterChange: (columnId: string, value: ColumnFilter) => void
  onToggleRow: (taskId: number, additive: boolean) => void
  onToggleAll: () => void
  onCommit: (taskId: number, column: ColumnDef, value: unknown) => Promise<boolean>
  onOpenTask: (taskId: number) => void
}

function flatten(groups: RowGroup[], grouped: boolean, collapsed: Set<string>): FlatItem[] {
  const items: FlatItem[] = []
  groups.forEach((group, index) => {
    if (grouped) {
      items.push({ kind: 'group', group, index })
      if (collapsed.has(group.key)) return
    }
    for (const row of group.rows) items.push({ kind: 'row', row })
  })
  return items
}

export function Table(props: TableProps): JSX.Element {
  const {
    columns,
    groups,
    grouped,
    collapsed,
    selected,
    sort,
    filters,
    showFilters,
    columnWidth,
    isEditable,
    onToggleGroup,
    onFilterChange,
    onToggleSort,
    onToggleRow,
    onToggleAll,
    onCommit,
    onOpenTask,
  } = props

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(600)

  const items = useMemo(
    () => flatten(groups, grouped, collapsed),
    [groups, grouped, collapsed],
  )

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = (): void => setViewport(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const total = items.length
  const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const end = Math.min(total, Math.ceil((scrollTop + viewport) / ITEM_HEIGHT) + OVERSCAN)
  const visible = items.slice(start, end)

  const allSelected = total > 0 && groups.every((g) => g.rows.every((r) => selected.has(r.id)))

  return (
    <div
      class="ktv-scroll"
      ref={scrollRef}
      onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
    >
      <div class="ktv-grid">
        <div class="ktv-row ktv-head">
          <div class="ktv-cell-gutter">
            <input
              type="checkbox"
              checked={allSelected}
              title="Select all rows"
              onChange={onToggleAll}
            />
          </div>
          {columns.map((column) => (
            <div
              key={column.id}
              class="ktv-cell"
              style={{ width: `${columnWidth(column)}px`, padding: '6px 8px' }}
              onClick={() => onToggleSort(column.id)}
              title={`Sort by ${column.label}`}
            >
              <span>{column.label}</span>
              {sort?.columnId === column.id && (
                <span class="ktv-sort-marker">{sort.direction === 'asc' ? '↑' : '↓'}</span>
              )}
            </div>
          ))}
        </div>

        {showFilters && (
          <div class="ktv-row ktv-filterrow">
            <div class="ktv-cell-gutter" />
            {columns.map((column) => (
              <div key={column.id} class="ktv-cell" style={{ width: `${columnWidth(column)}px` }}>
                {column.filterKind === 'checklist' ? (
                  <ChecklistFilter
                    column={column}
                    selected={selectedValues(filters[column.id])}
                    onChange={(values) => onFilterChange(column.id, values)}
                  />
                ) : (
                  <input
                    class="ktv-filter-input"
                    type="text"
                    value={typeof filters[column.id] === 'string' ? (filters[column.id] as string) : ''}
                    placeholder="Filter…"
                    title={`Filter ${column.label}. Use is:empty or is:set to match blank and non-blank cells.`}
                    onInput={(event) =>
                      onFilterChange(column.id, (event.target as HTMLInputElement).value)
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {total === 0 ? (
          <div class="ktv-empty">No cards match the current filters.</div>
        ) : (
          <>
            <div class="ktv-spacer" style={{ height: `${start * ITEM_HEIGHT}px` }} />
            {visible.map((item) =>
              item.kind === 'group' ? (
                <div
                  class="ktv-group"
                  key={`g:${item.group.key}:${item.index}`}
                  onClick={() => onToggleGroup(item.group.key)}
                >
                  <span class="ktv-group-caret">
                    {collapsed.has(item.group.key) ? '▶' : '▼'}
                  </span>
                  <span>{item.group.label}</span>
                  <span class="ktv-group-count">{item.group.rows.length}</span>
                </div>
              ) : (
                <div
                  class={`ktv-row ktv-row-body${selected.has(item.row.id) ? ' ktv-row-selected' : ''}`}
                  key={`r:${item.row.id}`}
                >
                  <div class="ktv-cell-gutter">
                    <input
                      type="checkbox"
                      checked={selected.has(item.row.id)}
                      onClick={(event) =>
                        onToggleRow(item.row.id, (event as MouseEvent).shiftKey)
                      }
                      onChange={() => undefined}
                    />
                  </div>
                  {columns.map((column) => (
                    <Cell
                      key={column.id}
                      column={column}
                      row={item.row}
                      editable={isEditable(column)}
                      width={columnWidth(column)}
                      onCommit={(col, value) => onCommit(item.row.id, col, value)}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                </div>
              ),
            )}
            <div class="ktv-spacer" style={{ height: `${(total - end) * ITEM_HEIGHT}px` }} />
          </>
        )}
      </div>
    </div>
  )
}

export const GUTTER = GUTTER_WIDTH
