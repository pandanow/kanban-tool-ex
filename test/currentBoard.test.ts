import { describe, expect, it } from 'vitest'
import { boardIdFromDom, boardIdFromUrl } from '../src/kt/currentBoard'

describe('boardIdFromUrl', () => {
  it('reads the id from the board URL shapes Kanban Tool uses', () => {
    expect(boardIdFromUrl('https://acme.kanbantool.com/b/123456')).toBe(123456)
    expect(boardIdFromUrl('https://acme.kanbantool.com/b/123456#/')).toBe(123456)
    expect(boardIdFromUrl('https://acme.kanbantool.com/boards/99')).toBe(99)
    expect(boardIdFromUrl('https://acme.kanbantool.com/x?board_id=42')).toBe(42)
  })

  it('returns null off a board page rather than guessing', () => {
    expect(boardIdFromUrl('https://acme.kanbantool.com/')).toBeNull()
    expect(boardIdFromUrl('https://acme.kanbantool.com/account/settings')).toBeNull()
  })
})

describe('boardIdFromDom', () => {
  it('reads data-board-id, the attribute a real board carries', () => {
    document.body.innerHTML =
      '<kt-board data-board-id="1193733" data-offset-top="30" style="--kt-board--zoom: 1;"></kt-board>'
    expect(boardIdFromDom()).toBe(1193733)
  })

  it('returns null when there is no board element', () => {
    document.body.innerHTML = '<div></div>'
    expect(boardIdFromDom()).toBeNull()
  })

  it('returns null rather than NaN when the attribute is junk', () => {
    document.body.innerHTML = '<kt-board data-board-id="not-a-number"></kt-board>'
    expect(boardIdFromDom()).toBeNull()
  })
})
