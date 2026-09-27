// Typed shims for the globals Kanban Tool exposes on board pages.
//
// These describe the surface documented at https://kanbantool.com/developer/sdk and
// https://kanbantool.com/developer/api-v3 - nothing here is our own invention, and
// nothing outside this file should reach for `window.KT` directly.
//
// The host page runs Backbone.js, so models are Backbone models: `get`/`set`/`save`
// plus `change`/`add`/`remove`/`sync` events.

export type CustomFieldType = 'text' | 'link' | 'number' | 'select' | 'date' | 'user'

/** One `settings.custom_field_N` entry on a board. */
export interface CustomFieldSetting {
  label?: string
  type?: CustomFieldType
  width?: number | string
  /** Newline- or comma-separated choices for `select`, depending on board age. */
  options?: string | string[]
  multiple?: boolean | number
  multiline?: boolean | number
}

export interface BoardSettings {
  [key: string]: unknown
}

export interface WorkflowStage {
  id: number
  board_id: number
  parent_id: number | null
  lft: number
  rgt: number
  position: number
  name: string
  description?: string
  wip_limit?: number | null
  wip_limit_type?: string
  lane_type_id?: number
  lane_type?: string
  lane_width?: number
  archive_enabled?: boolean
}

export interface Swimlane {
  id: number
  board_id: number
  position: number
  name: string
  description?: string
}

export interface CardType {
  id: number
  board_id: number
  name: string
  color_ref?: string
  is_default?: boolean
  is_disabled?: boolean
  position?: number
  color_attrs?: unknown
}

export interface Collaborator {
  id: number
  user_id?: number
  name?: string
  initials?: string
  email?: string
  avatar_url?: string
}

/** Task attributes, per the API v3 object reference. */
export interface TaskAttributes {
  id: number
  version?: number
  external_id?: string | null
  external_link?: string | null
  board_id: number
  board_version?: number
  swimlane_id: number | null
  workflow_stage_id: number | null
  card_type_id: number | null
  card_color?: string | null
  created_by_id?: number | null
  assigned_user_id: number | null
  position?: number
  name: string
  description?: string | null
  priority?: number | string | null
  tags?: string | null
  time_estimate?: number | null
  size_estimate?: number | null
  size_estimate_description?: string | null
  due_date?: string | null
  postponed_until?: string | null
  created_at?: string | null
  updated_at?: string | null
  archived_at?: string | null
  deleted_at?: string | null
  comments_count?: number
  timers_total?: number
  timers_active_count?: number
  subtasks_count?: number
  subtasks_completed_count?: number
  attachments_count?: number
  block_reason?: string | null
  recurring_schedule?: unknown
  /** custom_field_1 .. custom_field_N */
  [customField: string]: unknown
}

export interface BoardAttributes {
  id: number
  version?: number
  name: string
  description?: string | null
  owner_id?: number
  card_types?: CardType[]
  swimlanes?: Swimlane[]
  workflow_stages?: WorkflowStage[]
  settings?: BoardSettings
  collaborators?: Collaborator[]
  [key: string]: unknown
}

export type EventCallback = (...args: unknown[]) => void

export interface BackboneEventEmitter {
  on(event: string, cb: EventCallback, context?: unknown): unknown
  off(event?: string, cb?: EventCallback, context?: unknown): unknown
}

export interface SaveOptions {
  wait?: boolean
  patch?: boolean
  success?: (model: unknown, response: unknown) => void
  error?: (model: unknown, response: unknown) => void
}

export interface KTModel<A> extends BackboneEventEmitter {
  id: number
  cid?: string
  attributes: A
  get<K extends keyof A>(key: K): A[K]
  set(attrs: Partial<A>): unknown
  set<K extends keyof A>(key: K, value: A[K]): unknown
  save(attrs?: Partial<A> | null, options?: SaveOptions): unknown
  toJSON(): A
}

export type KTTask = KTModel<TaskAttributes>

export interface KTBoard extends KTModel<BoardAttributes> {
  /** Tasks currently loaded for this board. */
  tasks(): KTTask[] | { models: KTTask[] }
}

export interface KTCollection<M> extends BackboneEventEmitter {
  models: M[]
  get(id: number | string): M | undefined
  toArray?(): M[]
}

export interface KTTaskCollection extends KTCollection<KTTask> {
  /** Bulk update: KT.tasks.groupUpdate([100, 200], { card_color: 'pink' }) */
  groupUpdate(ids: number[], attributes: Partial<TaskAttributes>): unknown
  groupUpdateFilters: Array<{
    action(tasks: unknown, newAttributes: Partial<TaskAttributes>): void
  }>
}

export interface KTBoardCollection extends KTCollection<KTBoard> {
  load(boardId: number, callback: (board: KTBoard) => void): unknown
  current?: KTBoard
}

export type Permission =
  | 'read_tasks'
  | 'create_tasks'
  | 'update_tasks'
  | 'move_tasks'
  | 'delete_tasks'

export interface KTCurrentUser extends KTModel<Record<string, unknown>> {
  can(permission: Permission, boardId?: number): boolean
}

export interface ContextMenuEntry {
  name: string
  permissions?: Permission
  filter?: (...args: unknown[]) => boolean
  action: (...args: unknown[]) => void
}

/**
 * On a real board `contextMenu` is NOT a plain array - it has `push` but not the other
 * array methods, and calling one throws. Typed as the intersection of what is actually
 * safe to use.
 */
export type ContextMenuHost = { push(entry: ContextMenuEntry): unknown }

export interface KTElement {
  contextMenu?: ContextMenuHost | ContextMenuEntry[]
  header?: unknown[]
  footer?: unknown[]
}

export interface KTGlobal {
  onInit(success: () => void, failure?: (err?: unknown) => void): void
  boards: KTBoardCollection
  tasks: KTTaskCollection
  currentUser: KTCurrentUser
  Elements: {
    Task?: KTElement
    Tasklist?: KTElement
    Board?: KTElement
    Taskview?: KTElement
  }
  notice(title: string, message?: string): void
  warn(title: string, message?: string): void
  error(title: string, message?: string): void
  help?(): void
}

declare global {
  interface Window {
    KT?: KTGlobal
    jQuery?: JQueryStatic
    $?: JQueryStatic
    KTTableView?: unknown
  }
}

/** Minimal jQuery surface - the host page's jQuery, used only for its event bus. */
export interface JQueryStatic {
  (selector: unknown): {
    on(event: string, handler: (...args: unknown[]) => void): unknown
    off(event: string, handler?: (...args: unknown[]) => void): unknown
    html(value: string): unknown
    appendTo(target: string | Element): unknown
  }
}

export {}
