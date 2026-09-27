import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { BoardStore } from '../kt/store'
import { canEditAttribute } from '../kt/permissions'
import {
  EMPTY_VIEW_STATE,
  loadViewState,
  saveViewState,
  type StoredViewState,
} from '../kt/persistence'
import { findColumn, groupableColumns, type ColumnDef } from '../model/columns'
import {
  filterRows,
  hasActiveFilter,
  type ColumnFilter,
  type FilterState,
} from '../model/filtering'
import { countRows, groupRows } from '../model/grouping'
import { sortRows } from '../model/sorting'
import type { Row } from '../model/rows'
import { saveCell } from '../edit/save'
import { bulkUpdate } from '../edit/bulk'
import { openTask, type TableLayer } from '../kt/openTask'
import { getKT } from '../kt/env'
import { Toolbar } from './Toolbar'
import { Table } from './Table'
import { BulkBar } from './BulkBar'

export interface TableViewProps {
  store: BoardStore
  onClose: () => void
  /** Lets a card open over the table - see src/kt/openTask.ts. */
  layer: TableLayer
}

export function TableView({ store, onClose, layer }: TableViewProps): JSX.Element {
  const boardId = store.board.get('id')
  const userId = getKT()?.currentUser?.get('id') as number | undefined

  // Re-render when the store patches rows. The store already coalesces bursts of
  // remote changes into one notification per frame.
  const [, setTick] = useState(0)
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), [store])

  const [view, setView] = useState<StoredViewState>(() => loadViewState(boardId, userId))
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const lastClickedRef = useRef<number | null>(null)

  useEffect(() => {
    saveViewState(boardId, userId, view)
  }, [boardId, userId, view])

  const update = useCallback((patch: Partial<StoredViewState>): void => {
    setView((current) => ({ ...current, ...patch }))
  }, [])

  const columns = store.columns

  const hiddenIds = useMemo(() => {
    const explicit = view.hiddenColumns
    return new Set(explicit ?? columns.filter((c) => c.defaultHidden).map((c) => c.id))
  }, [view.hiddenColumns, columns])

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenIds.has(c.id)),
    [columns, hiddenIds],
  )

  const filter: FilterState = useMemo(
    () => ({ columns: view.filters, search: view.search }),
    [view.filters, view.search],
  )

  const groups = useMemo(() => {
    const groupColumn = view.groupBy ? findColumn(columns, view.groupBy) : undefined
    const sortColumn = view.sort ? findColumn(columns, view.sort.columnId) : undefined

    let rows: Row[] = filterRows(store.rows, filter, visibleColumns)
    if (sortColumn && view.sort) rows = sortRows(rows, sortColumn, view.sort.direction)
    return groupRows(rows, groupColumn)
  }, [store.rows, filter, view.groupBy, view.sort, visibleColumns, columns])

  const visibleRowIds = useMemo(
    () => groups.flatMap((group) => group.rows.map((row) => row.id)),
    [groups],
  )

  const collapsed = useMemo(() => new Set(view.collapsedGroups), [view.collapsedGroups])

  const isEditable = useCallback(
    (column: ColumnDef): boolean =>
      column.editable && column.attribute !== null && canEditAttribute(column.attribute, boardId),
    [boardId],
  )

  const columnWidth = useCallback(
    (column: ColumnDef): number => view.columnWidths[column.id] ?? column.width,
    [view.columnWidths],
  )

  const onCommit = useCallback(
    async (taskId: number, column: ColumnDef, value: unknown): Promise<boolean> => {
      const task = store.getTask(taskId)
      if (!task || !column.attribute) return false
      const result = await saveCell(task, column.attribute, value)
      return result.ok
    },
    [store],
  )

  const onToggleRow = useCallback(
    (taskId: number, additive: boolean): void => {
      setSelected((current) => {
        const next = new Set(current)
        const anchor = lastClickedRef.current
        if (additive && anchor !== null) {
          const from = visibleRowIds.indexOf(anchor)
          const to = visibleRowIds.indexOf(taskId)
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from]
            for (let i = lo; i <= hi; i += 1) {
              const id = visibleRowIds[i]
              if (id !== undefined) next.add(id)
            }
            return next
          }
        }
        if (next.has(taskId)) next.delete(taskId)
        else next.add(taskId)
        lastClickedRef.current = taskId
        return next
      })
    },
    [visibleRowIds],
  )

  const onToggleAll = useCallback((): void => {
    setSelected((current) =>
      current.size === visibleRowIds.length ? new Set() : new Set(visibleRowIds),
    )
  }, [visibleRowIds])

  const onToggleSort = useCallback(
    (columnId: string): void => {
      setView((current) => {
        if (current.sort?.columnId !== columnId) {
          return { ...current, sort: { columnId, direction: 'asc' } }
        }
        return current.sort.direction === 'asc'
          ? { ...current, sort: { columnId, direction: 'desc' } }
          : { ...current, sort: null }
      })
    },
    [],
  )

  const onToggleGroup = useCallback((key: string): void => {
    setView((current) => {
      const next = new Set(current.collapsedGroups)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...current, collapsedGroups: [...next] }
    })
  }, [])

  const onToggleColumn = useCallback(
    (columnId: string): void => {
      setView((current) => {
        const explicit = new Set(
          current.hiddenColumns ?? columns.filter((c) => c.defaultHidden).map((c) => c.id),
        )
        if (explicit.has(columnId)) explicit.delete(columnId)
        else explicit.add(columnId)
        return { ...current, hiddenColumns: [...explicit] }
      })
    },
    [columns],
  )

  const onFilterChange = useCallback((columnId: string, value: ColumnFilter): void => {
    setView((current) => ({
      ...current,
      filters: { ...current.filters, [columnId]: value },
    }))
  }, [])

  const onApplyBulk = useCallback(
    (column: ColumnDef, value: unknown): void => {
      if (!column.attribute) return
      const result = bulkUpdate([...selected], { [column.attribute]: value }, boardId)
      if (result.ok) setSelected(new Set())
    },
    [selected, boardId],
  )

  const totalCount = store.rows.length
  const shownCount = countRows(groups)

  return (
    <>
      <Toolbar
        boardName={store.board.get('name')}
        allColumns={columns}
        visibleColumns={visibleColumns}
        groupableColumns={groupableColumns(columns)}
        groupBy={view.groupBy}
        search={filter.search}
        rowCount={shownCount}
        totalCount={totalCount}
        onGroupByChange={(columnId) => update({ groupBy: columnId, collapsedGroups: [] })}
        onSearchChange={(value) => update({ search: value })}
        filtersShown={view.showFilters}
        onToggleFilters={() => update({ showFilters: !view.showFilters })}
        filtersActive={hasActiveFilter(filter)}
        onToggleColumn={onToggleColumn}
        onResetView={() => setView({ ...EMPTY_VIEW_STATE })}
        onClose={onClose}
      />

      {selected.size > 0 && (
        <BulkBar
          selectedCount={selected.size}
          columns={visibleColumns.filter(isEditable)}
          onApply={onApplyBulk}
          onClear={() => setSelected(new Set())}
        />
      )}

      <Table
        columns={visibleColumns}
        groups={groups}
        grouped={view.groupBy !== null}
        collapsed={collapsed}
        selected={selected}
        sort={view.sort}
        filters={view.filters}
        showFilters={view.showFilters}
        columnWidth={columnWidth}
        isEditable={isEditable}
        onToggleGroup={onToggleGroup}
        onToggleSort={onToggleSort}
        onFilterChange={onFilterChange}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        onCommit={onCommit}
        onOpenTask={(taskId) => void openTask(taskId, layer)}
      />
    </>
  )
}
