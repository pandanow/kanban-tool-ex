// Live view of one board's cards.
//
// The board's data is already in the page as Backbone models, kept in sync with the
// server by Kanban Tool itself - so the table needs no polling and no API token. We
// subscribe to the same models the board renders from, which is why an edit made
// anywhere (this table, the board, another person's browser) shows up here.
//
// Only rows whose task actually changed are rebuilt. A full rebuild on every remote
// change would be correct but wasteful on a large board, and row identity is what lets
// Preact keep an open cell editor mounted while the rest of the table updates.

import { getKT } from './env'
import { buildColumns, type ColumnDef } from '../model/columns'
import { buildRow, isVisibleTask, type Row } from '../model/rows'
import type { BoardAttributes, KTBoard, KTTask, TaskAttributes } from './types'

type Listener = () => void

function asTaskArray(result: KTTask[] | { models: KTTask[] } | undefined): KTTask[] {
  if (!result) return []
  return Array.isArray(result) ? result : (result.models ?? [])
}

export class BoardStore {
  readonly board: KTBoard
  columns: ColumnDef[]
  rows: Row[] = []

  private readonly boardId: number
  private readonly tasksById = new Map<number, KTTask>()
  private readonly rowsById = new Map<number, Row>()
  private readonly listeners = new Set<Listener>()
  private readonly dirty = new Set<number>()
  private rebuildAll = true
  private flushHandle: number | null = null
  private disposed = false

  constructor(board: KTBoard) {
    this.board = board
    this.boardId = board.get('id')
    this.columns = buildColumns(board.attributes as BoardAttributes)
    this.refresh()
    this.listen()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getTask(id: number): KTTask | undefined {
    return this.tasksById.get(id)
  }

  getTasks(ids: number[]): KTTask[] {
    return ids
      .map((id) => this.tasksById.get(id))
      .filter((task): task is KTTask => task !== undefined)
  }

  /** Rebuild everything from the board model. Used on mount and on board-level changes. */
  refresh(): void {
    this.columns = buildColumns(this.board.attributes as BoardAttributes)
    this.tasksById.clear()
    this.rowsById.clear()

    const tasks = asTaskArray(this.board.tasks()).filter((task) =>
      isVisibleTask(task.attributes as TaskAttributes),
    )
    for (const task of tasks) {
      this.tasksById.set(task.get('id'), task)
      this.rowsById.set(task.get('id'), buildRow(task.attributes as TaskAttributes, this.columns))
    }
    this.reorder(tasks)
  }

  private reorder(tasks: KTTask[]): void {
    // `position` is a card's order within its stage, so this is board order once the
    // rows are grouped by stage (the default). Ties fall back to id for stability.
    const ordered = tasks.slice().sort((a, b) => {
      const aPos = (a.get('position') as number | undefined) ?? 0
      const bPos = (b.get('position') as number | undefined) ?? 0
      return aPos === bPos ? a.get('id') - b.get('id') : aPos - bPos
    })
    this.rows = ordered
      .map((task) => this.rowsById.get(task.get('id')))
      .filter((row): row is Row => row !== undefined)
  }

  private listen(): void {
    const kt = getKT()
    if (!kt) return
    kt.tasks.on('add', this.onAdd)
    kt.tasks.on('remove', this.onRemove)
    kt.tasks.on('change', this.onChange)
    this.board.on('change', this.onBoardChange)
  }

  dispose(): void {
    this.disposed = true
    const kt = getKT()
    if (kt) {
      kt.tasks.off('add', this.onAdd)
      kt.tasks.off('remove', this.onRemove)
      kt.tasks.off('change', this.onChange)
    }
    this.board.off('change', this.onBoardChange)
    this.listeners.clear()
    if (this.flushHandle !== null) {
      cancelAnimationFrame(this.flushHandle)
      this.flushHandle = null
    }
  }

  private isOurs(task: KTTask | undefined): task is KTTask {
    return !!task && typeof task.get === 'function' && task.get('board_id') === this.boardId
  }

  private onAdd = (model: unknown): void => {
    const task = model as KTTask
    if (!this.isOurs(task)) return
    this.tasksById.set(task.get('id'), task)
    this.rebuildAll = true
    this.scheduleFlush()
  }

  private onRemove = (model: unknown): void => {
    const task = model as KTTask
    if (!this.isOurs(task)) return
    this.tasksById.delete(task.get('id'))
    this.rowsById.delete(task.get('id'))
    this.rebuildAll = true
    this.scheduleFlush()
  }

  private onChange = (model: unknown): void => {
    const task = model as KTTask
    if (!this.isOurs(task)) return
    const attrs = task.attributes as TaskAttributes
    // Archiving, deleting or moving a card changes which rows exist or their order.
    if (!isVisibleTask(attrs) || !this.tasksById.has(task.get('id'))) {
      this.rebuildAll = true
    } else {
      this.dirty.add(task.get('id'))
    }
    this.scheduleFlush()
  }

  private onBoardChange = (): void => {
    // Custom field definitions, stages, swimlanes and card types all live on the board.
    this.rebuildAll = true
    this.scheduleFlush()
  }

  /** Remote updates arrive in bursts; coalesce them into one render per frame. */
  private scheduleFlush(): void {
    if (this.disposed || this.flushHandle !== null) return
    this.flushHandle = requestAnimationFrame(() => {
      this.flushHandle = null
      this.flush()
    })
  }

  private flush(): void {
    if (this.disposed) return
    if (this.rebuildAll) {
      this.rebuildAll = false
      this.dirty.clear()
      this.refresh()
    } else if (this.dirty.size > 0) {
      for (const id of this.dirty) {
        const task = this.tasksById.get(id)
        if (!task) continue
        this.rowsById.set(id, buildRow(task.attributes as TaskAttributes, this.columns))
      }
      this.dirty.clear()
      // Rebuild the ordered array so consumers see new row objects for changed rows,
      // while unchanged rows keep their identity.
      this.rows = this.rows.map((row) => this.rowsById.get(row.id) ?? row)
    } else {
      return
    }
    for (const listener of this.listeners) listener()
  }
}
