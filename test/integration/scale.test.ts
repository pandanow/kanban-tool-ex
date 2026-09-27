import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { close, open } from '../../src/ui/overlay'
import { board, task } from '../fixtures/board'
import { installFakeKT, setupBoardPage } from './fakeKT'

// A board with a few thousand cards is normal, and rendering a DOM row for each one is
// what makes a naive table unusable. These tests pin the windowing behaviour.

const CARD_COUNT = 2000

const settle = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const renderedRows = (): number => document.querySelectorAll('.ktv-row-body').length

beforeEach(async () => {
  // View preferences persist per user and board, so without this a test inherits the
  // grouping, filters and column choices the previous one left behind.
  window.localStorage.clear()
  setupBoardPage()
  const stages = [1, 3, 4, 5]
  installFakeKT(
    board,
    Array.from({ length: CARD_COUNT }, (_, i) =>
      task({
        id: i + 1,
        name: `Card ${i + 1}`,
        position: i,
        workflow_stage_id: stages[i % stages.length],
        assigned_user_id: i % 2 === 0 ? 30 : 31,
      }),
    ),
  )
  await open()
  await settle()
})

afterEach(() => {
  close()
  document.body.innerHTML = ''
})

describe('a board with thousands of cards', () => {
  it('renders only a window of rows, not one per card', () => {
    expect(renderedRows()).toBeGreaterThan(0)
    expect(renderedRows()).toBeLessThan(CARD_COUNT / 10)
  })

  it('still counts every card in the toolbar', () => {
    expect(document.querySelector('.ktv-count')?.textContent).toBe(`${CARD_COUNT} cards`)
  })

  it('renders different rows once scrolled', async () => {
    const scroller = document.querySelector('.ktv-scroll') as HTMLElement
    const before = [...document.querySelectorAll('.ktv-row-body')].map((r) => r.textContent)

    Object.defineProperty(scroller, 'scrollTop', { value: 12000, writable: true })
    scroller.dispatchEvent(new window.Event('scroll', { bubbles: true }))
    await settle()

    const after = [...document.querySelectorAll('.ktv-row-body')].map((r) => r.textContent)
    expect(after).not.toEqual(before)
    expect(renderedRows()).toBeLessThan(CARD_COUNT / 10)
  })

  it('reserves the full scroll height so the scrollbar is honest', () => {
    const spacers = [...document.querySelectorAll('.ktv-spacer')] as HTMLElement[]
    const reserved = spacers.reduce(
      (total, el) => total + Number.parseInt(el.style.height || '0', 10),
      0,
    )
    // Every card, plus one header per non-empty group, minus the handful rendered.
    expect(reserved).toBeGreaterThan(CARD_COUNT * 20)
  })

  it('filters the whole board, not just the rendered window', async () => {
    const search = document.querySelector('.ktv-search') as HTMLInputElement
    search.value = 'Card 1999'
    search.dispatchEvent(new window.Event('input', { bubbles: true }))
    await settle()

    expect(document.querySelector('.ktv-count')?.textContent).toBe(`1 of ${CARD_COUNT} cards`)
    expect(document.body.textContent).toContain('Card 1999')
  })
})
