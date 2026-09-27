// A stand-in for the Kanban Tool page globals: enough Backbone to exercise the real
// store, overlay and editors without a browser or an account. It is deliberately a
// faithful shape rather than a mock of our own calls - if the SDK's contract is
// different from this, these tests should be what tells us.

import type {
  BoardAttributes,
  KTBoard,
  KTGlobal,
  KTTask,
  Permission,
  TaskAttributes,
} from '../../src/kt/types'

type Handler = (...args: unknown[]) => void

class Emitter {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, cb: Handler): void {
    const set = this.handlers.get(event) ?? new Set<Handler>()
    set.add(cb)
    this.handlers.set(event, set)
  }

  off(event?: string, cb?: Handler): void {
    if (!event) return this.handlers.clear()
    if (!cb) return void this.handlers.delete(event)
    this.handlers.get(event)?.delete(cb)
  }

  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers.get(event) ?? []) cb(...args)
  }
}

export class FakeTask extends Emitter implements KTTask {
  attributes: TaskAttributes
  /** Every save the code under test issued, in order. */
  saves: Array<Partial<TaskAttributes>> = []
  /** Set to make the next save fail, the way a stale version does. */
  failNextSave: { status?: number; responseJSON?: { error?: string } } | null = null

  constructor(attributes: TaskAttributes, private readonly collection: FakeTaskCollection) {
    super()
    this.attributes = attributes
  }

  get id(): number {
    return this.attributes.id
  }

  get<K extends keyof TaskAttributes>(key: K): TaskAttributes[K] {
    return this.attributes[key]
  }

  set(keyOrAttrs: unknown, value?: unknown): this {
    const patch =
      typeof keyOrAttrs === 'string'
        ? ({ [keyOrAttrs]: value } as Partial<TaskAttributes>)
        : (keyOrAttrs as Partial<TaskAttributes>)
    this.attributes = { ...this.attributes, ...patch }
    this.emit('change', this)
    this.collection.emit('change', this)
    return this
  }

  save(attrs?: Partial<TaskAttributes> | null, options?: {
    success?: (m: unknown, r: unknown) => void
    error?: (m: unknown, r: unknown) => void
  }): this {
    if (attrs) {
      this.saves.push(attrs)
      this.set(attrs)
    }
    const failure = this.failNextSave
    this.failNextSave = null
    // Resolve asynchronously, as a real request would.
    queueMicrotask(() => {
      if (failure) options?.error?.(this, failure)
      else options?.success?.(this, {})
    })
    return this
  }

  toJSON(): TaskAttributes {
    return this.attributes
  }
}

export class FakeTaskCollection extends Emitter {
  models: FakeTask[] = []
  groupUpdates: Array<{ ids: number[]; attributes: Partial<TaskAttributes> }> = []
  groupUpdateFilters: Array<{ action(t: unknown, a: Partial<TaskAttributes>): void }> = []

  get(id: number): FakeTask | undefined {
    return this.models.find((m) => m.id === id)
  }

  add(attributes: TaskAttributes): FakeTask {
    const task = new FakeTask(attributes, this)
    this.models.push(task)
    this.emit('add', task)
    return task
  }

  remove(id: number): void {
    const index = this.models.findIndex((m) => m.id === id)
    if (index === -1) return
    const [task] = this.models.splice(index, 1)
    this.emit('remove', task)
  }

  groupUpdate(ids: number[], attributes: Partial<TaskAttributes>): void {
    this.groupUpdates.push({ ids, attributes })
    for (const id of ids) this.get(id)?.set(attributes)
  }
}

export class FakeBoard extends Emitter implements KTBoard {
  attributes: BoardAttributes

  constructor(attributes: BoardAttributes, private readonly collection: FakeTaskCollection) {
    super()
    this.attributes = attributes
  }

  get id(): number {
    return this.attributes.id as number
  }

  get<K extends keyof BoardAttributes>(key: K): BoardAttributes[K] {
    return this.attributes[key]
  }

  set(keyOrAttrs: unknown, value?: unknown): this {
    const patch =
      typeof keyOrAttrs === 'string'
        ? { [keyOrAttrs]: value }
        : (keyOrAttrs as Partial<BoardAttributes>)
    this.attributes = { ...this.attributes, ...patch }
    this.emit('change', this)
    return this
  }

  save(): this {
    return this
  }

  tasks(): KTTask[] {
    return this.collection.models.filter((t) => t.get('board_id') === this.id)
  }

  toJSON(): BoardAttributes {
    return this.attributes
  }
}

export interface FakeKT extends KTGlobal {
  tasks: FakeTaskCollection & KTGlobal['tasks']
  board: FakeBoard
  notices: Array<{ level: string; title: string; message?: string }>
}

export function installFakeKT(
  boardAttributes: BoardAttributes,
  taskAttributes: TaskAttributes[],
  options: { permissions?: Permission[] } = {},
): FakeKT {
  const granted = new Set<Permission>(
    options.permissions ?? ['read_tasks', 'create_tasks', 'update_tasks', 'move_tasks', 'delete_tasks'],
  )

  const tasks = new FakeTaskCollection()
  const board = new FakeBoard(boardAttributes, tasks)
  for (const attrs of taskAttributes) tasks.add(attrs)

  const notices: FakeKT['notices'] = []

  const kt = {
    onInit: (success: () => void) => success(),
    boards: {
      models: [board],
      current: board,
      get: () => board,
      load: (_id: number, cb: (b: KTBoard) => void) => cb(board),
      on: () => undefined,
      off: () => undefined,
    },
    tasks,
    currentUser: {
      id: 30,
      attributes: { id: 30, name: 'Ada Lovelace' },
      get: (key: string) => (key === 'id' ? 30 : undefined),
      set: () => undefined,
      save: () => undefined,
      toJSON: () => ({}),
      on: () => undefined,
      off: () => undefined,
      can: (permission: Permission) => granted.has(permission),
    },
    Elements: { Board: { contextMenu: [] } },
    notice: (title: string, message?: string) => notices.push({ level: 'notice', title, message }),
    warn: (title: string, message?: string) => notices.push({ level: 'warn', title, message }),
    error: (title: string, message?: string) => notices.push({ level: 'error', title, message }),
    board,
    notices,
  } as unknown as FakeKT

  ;(window as unknown as { KT: FakeKT }).KT = kt
  return kt
}

/**
 * Mirrors the markup a real board actually has: a Bootstrap 2.3.2 navbar whose
 * `.top-right-pane ._links` group holds the board-level links, and a <kt-board>
 * carrying `data-board-id` whose rect is scroll content far larger than the viewport.
 */
export function setupBoardPage(): { host: HTMLElement; boardElement: HTMLElement } {
  document.body.innerHTML = `
    <nav class="navbar">
      <div class="navbar-inner">
        <h2 class="brand"><a>Marketing Squad</a></h2>
        <div class="top-right-pane kt-side-panel-slide">
          <div class="_links"><a>Share</a><a>Settings</a><a>Help</a></div>
          <a class="_tools">Tools</a>
          <div class="_controls"></div>
        </div>
      </div>
    </nav>
    <div id="board-host">
      <kt-board data-board-id="77" data-offset-top="30"></kt-board>
    </div>
  `
  const host = document.getElementById('board-host') as HTMLElement
  const boardElement = document.querySelector('kt-board') as HTMLElement
  return { host, boardElement }
}

/** Strips the navbar, leaving a page no mount candidate matches. */
export function removeHeader(): void {
  document.querySelector('.navbar')?.remove()
}

export interface FakeCardsOptions {
  /** Where the opened task view lands: a modal on <body>, or inside <kt-board>. */
  attach?: 'body' | 'board'
  /**
   * Render the task view up front, hidden, and merely reveal it when a card is clicked
   * - a host that keeps one panel around rather than building a new one each time.
   */
  preRendered?: boolean
  /** The task view's z-index. Defaults to Bootstrap 2.3.2's modal layer, as the host
   *  page uses it. `null` renders a task view that is not layered at all. */
  zIndex?: number | null
}

/**
 * The board's own cards and task view, as far as src/kt/openTask.ts is concerned:
 * `<kt-task>` elements that open a `<kt-taskview>` when clicked, and a close button
 * that takes it away again. Both shapes of task view are buildable, because which one
 * a real board renders is not yet confirmed.
 */
export function installFakeCards(taskIds: number[], options: FakeCardsOptions = {}): void {
  const boardElement = document.querySelector('kt-board')
  if (!boardElement) throw new Error('installFakeCards() needs setupBoardPage() first')

  if (options.preRendered) {
    openFakeTaskView(0, options)
    closeFakeTaskView()
  }

  for (const id of taskIds) {
    const card = document.createElement('kt-task')
    card.setAttribute('data-id', String(id))
    card.addEventListener('click', () => {
      const existing = document.querySelector('kt-taskview') as HTMLElement | null
      if (options.preRendered && existing) {
        existing.setAttribute('data-task-id', String(id))
        existing.style.display = ''
        return
      }
      openFakeTaskView(id, options)
    })
    boardElement.appendChild(card)
  }
}

function openFakeTaskView(taskId: number, { attach = 'body', zIndex = 1050 }: FakeCardsOptions): void {
  document.querySelector('kt-taskview')?.remove()

  const view = document.createElement('kt-taskview')
  view.setAttribute('data-task-id', String(taskId))
  // Enough of a panel to be visible in the dev harness; the tests only read the layer.
  view.style.cssText =
    'position: fixed; top: 12%; left: 30%; width: 40%; height: 60%; padding: 16px;' +
    'background: #fff; border: 1px solid #9aa4b5; box-shadow: 0 6px 24px rgba(0,0,0,.3);'
  if (zIndex !== null) view.style.zIndex = String(zIndex)
  view.append(`Task #${taskId}`)

  const closeButton = document.createElement('button')
  closeButton.className = '_close'
  closeButton.textContent = 'Close'
  // The pilot board hides its task view rather than removing it, which is the harder
  // case to notice, so that is what the fake does.
  closeButton.addEventListener('click', () => closeFakeTaskView())
  view.appendChild(closeButton)

  const host = attach === 'board' ? document.querySelector('kt-board') : document.body
  host?.appendChild(view)
}

/** Closes the fake task view the way the real one closes: hidden, not removed. */
export function closeFakeTaskView(): void {
  const view = document.querySelector('kt-taskview') as HTMLElement | null
  if (view) view.style.display = 'none'
}
