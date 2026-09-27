import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { close, isOpen, open, viewportBox } from '../../src/ui/overlay'
import { board, task } from '../fixtures/board'
import { installFakeKT, setupBoardPage, type FakeKT } from './fakeKT'

let kt: FakeKT
let boardElement: HTMLElement

const tasks = [
  task({ id: 1, name: 'Fix login', workflow_stage_id: 1, priority: 1 }),
  task({ id: 2, name: 'Write docs', workflow_stage_id: 3, assigned_user_id: 31 }),
  task({ id: 3, name: 'Archived thing', workflow_stage_id: 1, archived_at: '2026-01-01' }),
]

// Preact flushes effects after a frame, so the view's subscription to the store is not
// attached the instant render() returns. Tests that fire model events must let that
// settle first, then let the resulting render flush.
const settle = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const root = (): HTMLElement | null => document.querySelector('.ktv-root')
const rows = (): HTMLElement[] => [...document.querySelectorAll('.ktv-row-body')] as HTMLElement[]
const groupHeaders = (): string[] =>
  [...document.querySelectorAll('.ktv-group')].map((el) => el.textContent ?? '')

beforeEach(async () => {
  // View preferences persist per user and board, so without this a test inherits the
  // grouping, filters and column choices the previous one left behind.
  window.localStorage.clear()
  const page = setupBoardPage()
  boardElement = page.boardElement
  kt = installFakeKT(board, tasks.map((t) => ({ ...t })))
  await open()
  await settle()
})

afterEach(() => {
  close()
  document.body.innerHTML = ''
})

describe('mounting', () => {
  it('renders the table over the board and hides it', () => {
    expect(isOpen()).toBe(true)
    expect(root()).not.toBeNull()
    // visibility, not display: display:none collapses the board's parent, which on a
    // real board left the overlay sized 0x0 and showing nothing.
    expect(boardElement.style.visibility).toBe('hidden')
    expect(boardElement.style.display).toBe('')
  })

  it('restores the board exactly on close, leaving nothing behind', () => {
    close()
    expect(isOpen()).toBe(false)
    expect(root()).toBeNull()
    expect(boardElement.style.visibility).toBe('')
    expect(document.contains(boardElement)).toBe(true)
  })

  it('never opens twice', async () => {
    await open()
    expect(document.querySelectorAll('.ktv-root')).toHaveLength(1)
  })
})

describe('contents', () => {
  it('shows one row per live card, excluding archived ones', () => {
    expect(rows()).toHaveLength(2)
    expect(document.body.textContent).toContain('Fix login')
    expect(document.body.textContent).not.toContain('Archived thing')
  })

  it('groups by stage in board order by default', () => {
    expect(groupHeaders().map((t) => t.replace(/[▶▼]/g, '').trim())).toEqual([
      'Backlog1',
      'Development / In progress1',
    ])
  })

  it('renders a column for each configured custom field', () => {
    const headers = [...document.querySelectorAll('.ktv-head .ktv-cell')].map(
      (el) => el.textContent ?? '',
    )
    expect(headers).toContain('Customer')
    expect(headers).toContain('Story points')
    expect(headers).toContain('Team')
    // The unlabelled custom_field_9 must not become a nameless column.
    expect(headers.some((h) => h.trim() === '')).toBe(false)
  })

  it('resolves ids to names in cells', () => {
    expect(document.body.textContent).toContain('Alan Turing')
    expect(document.body.textContent).toContain('High')
  })
})

describe('live updates from the board', () => {
  // The store coalesces model events into one notification per animation frame, and
  // Preact then flushes its render.
  const frame = settle

  it('picks up a change made elsewhere', async () => {
    kt.tasks.get(1)?.set({ name: 'Fix login properly' })
    await frame()
    expect(document.body.textContent).toContain('Fix login properly')
  })

  it('picks up a new card', async () => {
    kt.tasks.add(task({ id: 4, name: 'Brand new', workflow_stage_id: 1 }))
    await frame()
    expect(rows()).toHaveLength(3)
    expect(document.body.textContent).toContain('Brand new')
  })

  it('drops a card that gets archived', async () => {
    kt.tasks.get(2)?.set({ archived_at: '2026-02-02' })
    await frame()
    expect(rows()).toHaveLength(1)
    expect(document.body.textContent).not.toContain('Write docs')
  })
})

describe('remembering the view', () => {
  const settleTwice = async (): Promise<void> => {
    await settle()
    await settle()
  }

  it('comes back grouped the way the user left it', async () => {
    const groupBy = document.querySelector('.ktv-toolbar select') as HTMLSelectElement
    groupBy.value = 'assigned_user_id'
    groupBy.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settleTwice()
    expect(groupHeaders().join()).toContain('Ada Lovelace')

    close()
    await open()
    await settle()

    expect((document.querySelector('.ktv-toolbar select') as HTMLSelectElement).value).toBe(
      'assigned_user_id',
    )
    expect(groupHeaders().join()).toContain('Ada Lovelace')
  })

  it('keeps each board separate', async () => {
    const groupBy = document.querySelector('.ktv-toolbar select') as HTMLSelectElement
    groupBy.value = 'swimlane_id'
    groupBy.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settleTwice()

    close()
    document.body.innerHTML = ''
    setupBoardPage()
    installFakeKT({ ...board, id: 99 }, [task({ id: 1, board_id: 99 })])
    await open()
    await settle()

    expect((document.querySelector('.ktv-toolbar select') as HTMLSelectElement).value).toBe(
      'workflow_stage_id',
    )
  })
})

describe('where the overlay is placed', () => {
  // A real board measures 2245 x 14708px: <kt-board> is the scroll content, not a
  // viewport-sized pane. Sizing the overlay to that rect put the table off-screen.
  const REAL_BOARD_RECT = { top: 50, left: 4, width: 2245, height: 14708 }

  const stubRect = (element: HTMLElement, rect: Partial<DOMRect>): void => {
    element.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}), ...rect }) as DOMRect
  }

  const setViewport = (width: number, height: number): void => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  }

  const reopenWith = async (rect: Partial<DOMRect>, width = 1600, height = 900) => {
    close()
    setViewport(width, height)
    stubRect(boardElement, rect)
    await open()
    return root() as HTMLElement
  }

  it('sits on the body, not inside the board container', () => {
    // The board's parent collapses once the board is hidden, so the overlay must not
    // depend on it for its size.
    expect(root()?.parentElement).toBe(document.body)
  })

  it('starts where the board starts and ends at the bottom of the viewport', async () => {
    const container = await reopenWith(REAL_BOARD_RECT)
    expect(container.style.top).toBe('50px')
    expect(container.style.height).toBe('850px')
  })

  it('never extends past the viewport, however large the board is', async () => {
    const container = await reopenWith(REAL_BOARD_RECT)
    expect(Number.parseInt(container.style.width, 10)).toBeLessThanOrEqual(1600)
    expect(Number.parseInt(container.style.height, 10)).toBeLessThanOrEqual(900)
  })

  it('fills the viewport when the board starts off the bottom of it', async () => {
    const container = await reopenWith({ top: 5000, left: 0, width: 2245, height: 14708 })
    expect(container.style.top).toBe('0px')
    expect(container.style.height).toBe('900px')
  })

  it('never ends up with a zero size', () => {
    const style = root()?.style
    expect(style?.width).not.toBe('0px')
    expect(style?.height).not.toBe('0px')
    expect(style?.width).toBeTruthy()
    expect(style?.height).toBeTruthy()
  })

  it('re-measures when the window changes size', async () => {
    const container = await reopenWith(REAL_BOARD_RECT)
    expect(container.style.height).toBe('850px')

    setViewport(1600, 600)
    window.dispatchEvent(new window.Event('resize'))
    expect(container.style.height).toBe('550px')
  })

  it('stops following the board once closed', async () => {
    const container = await reopenWith(REAL_BOARD_RECT)
    close()

    setViewport(1600, 400)
    window.dispatchEvent(new window.Event('resize'))
    expect(container.style.height).toBe('850px')
    expect(document.contains(container)).toBe(false)
  })

  it('locks page scrolling while open and restores it on close', async () => {
    await reopenWith(REAL_BOARD_RECT)
    // The board's 14708px of content is still there behind the overlay.
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    close()
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
  })
})

describe('viewportBox', () => {
  // The pure geometry rule, pinned directly with the numbers a real board produced.
  const viewport = { width: 1600, height: 900 }

  it('clamps a board far taller and wider than the screen', () => {
    expect(viewportBox({ top: 50, left: 4 }, viewport)).toEqual({
      top: 50,
      left: 4,
      width: 1596,
      height: 850,
    })
  })

  it('treats a board scrolled above the viewport as starting at the top', () => {
    expect(viewportBox({ top: -2000, left: 0 }, viewport)).toEqual({
      top: 0,
      left: 0,
      width: 1600,
      height: 900,
    })
  })

  it('falls back to the whole viewport when the remaining strip is too small', () => {
    expect(viewportBox({ top: 880, left: 0 }, viewport)).toEqual({
      top: 0,
      left: 0,
      width: 1600,
      height: 900,
    })
  })
})

describe('when something paints over the table', () => {
  const frame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve()))

  const originalRect = Element.prototype.getBoundingClientRect
  const originalFromPoint = document.elementFromPoint

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalRect
    document.elementFromPoint = originalFromPoint
  })

  /** Every element reports a usable rect, so the occlusion check actually runs. */
  const giveEverythingSize = (): void => {
    Element.prototype.getBoundingClientRect = () =>
      ({ top: 50, left: 0, width: 1400, height: 800, right: 1400, bottom: 850, x: 0, y: 50, toJSON: () => ({}) }) as DOMRect
  }

  it('says so instead of leaving an apparently empty page', async () => {
    const intruder = document.createElement('div')
    intruder.className = 'kt-something-on-top'
    document.body.appendChild(intruder)

    giveEverythingSize()
    document.elementFromPoint = () => intruder

    close()
    await open()
    await frame()

    const notice = kt.notices.at(-1)
    expect(notice?.level).toBe('error')
    expect(notice?.title).toBe('Table view is hidden')
  })

  it('stays quiet when the table itself is on top', async () => {
    giveEverythingSize()
    close()
    await open()
    // Whatever is at that point is inside our container.
    document.elementFromPoint = () => document.querySelector('.ktv-toolbar')
    await frame()

    expect(kt.notices.some((n) => n.title === 'Table view is hidden')).toBe(false)
  })
})
