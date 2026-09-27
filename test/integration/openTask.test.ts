import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { close, isOpen, open } from '../../src/ui/overlay'
import { behindZIndex, isTaskOpen, stackingZIndex } from '../../src/kt/openTask'
import { board, task } from '../fixtures/board'
import {
  closeFakeTaskView,
  installFakeCards,
  installFakeKT,
  setupBoardPage,
  type FakeCardsOptions,
  type FakeKT,
} from './fakeKT'

let kt: FakeKT
let boardElement: HTMLElement

const tasks = [
  task({ id: 1, name: 'Fix login', workflow_stage_id: 1 }),
  task({ id: 2, name: 'Write docs', workflow_stage_id: 1 }),
]

const settle = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const root = (): HTMLElement | null => document.querySelector('.ktv-root')
const taskview = (): HTMLElement | null => document.querySelector('kt-taskview')
const openButtons = (): HTMLElement[] =>
  [...document.querySelectorAll('.ktv-row-body .ktv-open')] as HTMLElement[]

/** Clicks the ↗ on the first row and lets the task view settle. */
const openFirstCard = async (): Promise<void> => {
  openButtons()[0]?.click()
  await settle()
}

const start = async (options?: FakeCardsOptions, cardIds: number[] = [1, 2]): Promise<void> => {
  window.localStorage.clear()
  const page = setupBoardPage()
  boardElement = page.boardElement
  kt = installFakeKT(board, tasks.map((t) => ({ ...t })))
  installFakeCards(cardIds, options)
  await open()
  await settle()
}

afterEach(() => {
  close()
  closeFakeTaskView()
  document.body.innerHTML = ''
})

describe('opening a card from the table', () => {
  beforeEach(async () => {
    await start()
  })

  it('opens the card without taking the table down', async () => {
    await openFirstCard()
    expect(taskview()?.getAttribute('data-task-id')).toBe('1')
    expect(isOpen()).toBe(true)
    expect(isTaskOpen()).toBe(true)
    expect(root()).not.toBeNull()
  })

  it('drops the table just below the task view, and not lower', async () => {
    await openFirstCard()
    // The host's own modal layer is 1050; anything under it and over the board will do,
    // and staying as close as possible keeps the board covered.
    expect(root()?.style.zIndex).toBe('1049')
  })

  it('leaves the board hidden the whole time', async () => {
    // Deliberate, and the reason a card opens over the table at all: the table has to
    // drop below the stacking context the task view sits in, which on a real board is
    // the board's own. A board revealed behind it would paint over the table.
    await openFirstCard()
    expect(boardElement.style.visibility).toBe('hidden')
  })

  it('puts the table back on top when the card is closed', async () => {
    await openFirstCard()
    closeFakeTaskView()
    await settle()
    expect(isTaskOpen()).toBe(false)
    expect(isOpen()).toBe(true)
    // Back to the stylesheet's value rather than an inline one of our own.
    expect(root()?.style.zIndex).toBe('')
  })

  it('leaves nothing behind when the table is closed with a card open', async () => {
    await openFirstCard()
    close()
    expect(isTaskOpen()).toBe(false)
    expect(isOpen()).toBe(false)
    expect(boardElement.style.visibility).toBe('')
  })

  it('ends up on the card clicked last when two are clicked in a row', async () => {
    openButtons()[0]?.click()
    openButtons()[1]?.click()
    await settle()
    expect(taskview()?.getAttribute('data-task-id')).toBe('2')

    // One card open means one watcher: closing it must bring the table forward and
    // leave nothing running behind it.
    closeFakeTaskView()
    await settle()
    expect(isTaskOpen()).toBe(false)
    expect(root()?.style.zIndex).toBe('')
  })

  it('replaces an already open card rather than stacking watchers', async () => {
    await openFirstCard()
    openButtons()[1]?.click()
    await settle()
    expect(taskview()?.getAttribute('data-task-id')).toBe('2')
    expect(isTaskOpen()).toBe(true)
  })
})

describe('a task view rendered inside the board', () => {
  beforeEach(async () => {
    await start({ attach: 'board' })
  })

  it('is brought back on its own, with the board still hidden', async () => {
    await openFirstCard()
    const view = taskview() as HTMLElement
    expect(boardElement.contains(view)).toBe(true)
    // visibility is the one hiding switch a descendant can override.
    expect(view.style.visibility).toBe('visible')
    expect(boardElement.style.visibility).toBe('hidden')
  })

  it('gives the host element its own style back afterwards', async () => {
    await openFirstCard()
    const view = taskview() as HTMLElement
    close()
    expect(view.style.visibility).toBe('')
    expect(boardElement.style.visibility).toBe('')
  })

  it("drops below the board's own stacking context, which is why the board stays hidden", async () => {
    const host = document.getElementById('board-host') as HTMLElement
    host.style.position = 'relative'
    host.style.zIndex = '400'

    await openFirstCard()
    // The task view cannot escape the context its ancestors establish, so that is the
    // depth the table has to beat - and a board revealed at 400 would then paint over
    // a table at 399, which is the whole reason the board stays hidden.
    expect(root()?.style.zIndex).toBe('399')
    expect(boardElement.style.visibility).toBe('hidden')
  })

  it('reads the host writing over that override as the card closing', async () => {
    await openFirstCard()
    const view = taskview() as HTMLElement
    // Inherited hiding cannot be told from the host's own while the board is hidden, so
    // the host replacing the value we wrote is what gives it away.
    view.style.visibility = 'hidden'
    await settle()
    expect(isTaskOpen()).toBe(false)
    expect(root()?.style.zIndex).toBe('')
  })
})

describe("the card's other surfaces - the activity panel and its comment box", () => {
  const panel = (): HTMLElement | null => document.getElementById('kt-side_panel')

  it('drops the table below the panel as well as the task view', async () => {
    await start({ sidePanel: 'immediate' })
    await openFirstCard()
    // The panel is painted lower than the card itself (1040 against 1050), so it is the
    // panel that decides how deep the table goes; stopping at the card would bury it.
    expect(panel()).not.toBeNull()
    expect(root()?.style.zIndex).toBe('1039')
  })

  it('picks up a panel that arrives after the card', async () => {
    await start({ sidePanel: 'late' })
    await openFirstCard()
    expect(root()?.style.zIndex).toBe('1049')

    await new Promise((resolve) => setTimeout(resolve, 320))
    expect(panel()).not.toBeNull()
    expect(root()?.style.zIndex).toBe('1039')
  })

  it('brings a panel inside the hidden board back with the card', async () => {
    await start({ attach: 'board', sidePanel: 'immediate' })
    await openFirstCard()
    expect(panel()?.style.visibility).toBe('visible')

    close()
    expect(panel()?.style.visibility).toBe('')
  })

  it('never mistakes the page chrome for part of the card', async () => {
    // The navbar's own pane is `.top-right-pane.kt-side-panel-slide` on a real board,
    // which matches the panel candidates and would drag the table down to nothing.
    await start()
    const chrome = document.querySelector('.kt-side-panel-slide')
    expect(chrome).not.toBeNull()

    await openFirstCard()
    expect(root()?.style.zIndex).toBe('1049')
  })
})

describe('a task view that is revealed rather than built', () => {
  it('is noticed when the host shows a panel it already had in the page', async () => {
    await start({ preRendered: true })
    expect(taskview()).not.toBeNull()

    await openFirstCard()
    expect(taskview()?.getAttribute('data-task-id')).toBe('1')
    expect(isTaskOpen()).toBe(true)
    expect(root()?.style.zIndex).toBe('1049')
  })
})

describe('closing a card, whichever way the host does it', () => {
  beforeEach(async () => {
    await start()
  })

  it.each([
    ['display', (view: HTMLElement) => { view.style.display = 'none' }],
    ['being removed after all', (view: HTMLElement) => { view.remove() }],
    ['visibility', (view: HTMLElement) => { view.style.visibility = 'hidden' }],
    ['a class of the host\'s own', (view: HTMLElement) => {
      const style = document.createElement('style')
      style.textContent = '.kt-hidden { display: none; }'
      document.head.appendChild(style)
      view.className = 'kt-hidden'
    }],
  ])('brings the table forward when the card is hidden by %s', async (_name, hide) => {
    await openFirstCard()
    hide(taskview() as HTMLElement)
    await settle()
    expect(isTaskOpen()).toBe(false)
    expect(root()?.style.zIndex).toBe('')
  })
})

describe('when the card cannot be opened over the table', () => {
  it('falls back to the board when the card element is not on the page', async () => {
    await start(undefined, [])
    await openFirstCard()
    expect(isOpen()).toBe(false)
    expect(boardElement.style.visibility).toBe('')
    expect(kt.notices.at(-1)?.title).toBe('Card not on screen')
  })

  it('falls back to the board when no task view appears', async () => {
    await start()
    // A card that swallows the click, the way a stale selector would.
    for (const card of document.querySelectorAll('kt-task')) card.replaceWith(card.cloneNode())
    await openFirstCard()
    // The wait for a task view is generous; let it time out.
    await new Promise((resolve) => setTimeout(resolve, 2100))
    expect(isOpen()).toBe(false)
    expect(kt.notices.at(-1)?.title).toBe('Opened on the board')
  }, 10000)
})

describe('measuring how deep the table has to go', () => {
  it('reads the z-index the task view is painted at', async () => {
    await start()
    await openFirstCard()
    const view = taskview() as HTMLElement
    expect(stackingZIndex(view)).toBe(1050)
    expect(behindZIndex(view)).toBe(1049)
  })

  it('takes the outermost layered ancestor, which is what a child cannot escape', async () => {
    await start()
    const outer = document.createElement('div')
    outer.style.position = 'fixed'
    outer.style.zIndex = '900'
    const inner = document.createElement('div')
    inner.style.position = 'absolute'
    inner.style.zIndex = '5'
    outer.appendChild(inner)
    document.body.appendChild(outer)
    expect(stackingZIndex(inner)).toBe(900)
  })

  it('sits at the bottom for a task view that is not layered at all', async () => {
    await start({ zIndex: null })
    await openFirstCard()
    expect(stackingZIndex(taskview() as HTMLElement)).toBeNull()
    expect(root()?.style.zIndex).toBe('0')
  })
})
