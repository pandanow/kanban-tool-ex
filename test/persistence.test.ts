import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_VIEW_STATE, loadViewState, saveViewState } from '../src/kt/persistence'

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('view state', () => {
  it('starts from the defaults when nothing is stored', () => {
    expect(loadViewState(77, 30)).toEqual(EMPTY_VIEW_STATE)
  })

  it('round-trips what the user chose', () => {
    const state = {
      ...EMPTY_VIEW_STATE,
      groupBy: 'assigned_user_id',
      sort: { columnId: 'due_date', direction: 'desc' as const },
      hiddenColumns: ['tags'],
      collapsedGroups: ['30'],
    }
    saveViewState(77, 30, state)
    expect(loadViewState(77, 30)).toEqual(state)
  })

  it('keeps each board and each user separate', () => {
    saveViewState(77, 30, { ...EMPTY_VIEW_STATE, groupBy: 'swimlane_id' })
    expect(loadViewState(78, 30).groupBy).toBe(EMPTY_VIEW_STATE.groupBy)
    expect(loadViewState(77, 31).groupBy).toBe(EMPTY_VIEW_STATE.groupBy)
  })

  it('ignores state written by an older version of the extension', () => {
    saveViewState(77, 30, { ...EMPTY_VIEW_STATE, groupBy: 'swimlane_id' })
    const key = Object.keys(window.localStorage).find((k) => k.includes('kt-table-view'))
    if (!key) throw new Error('nothing stored')
    window.localStorage.setItem(key, JSON.stringify({ version: 0, groupBy: 'gone' }))
    expect(loadViewState(77, 30)).toEqual(EMPTY_VIEW_STATE)
  })

  it('survives corrupt stored data', () => {
    const key = Object.keys(window.localStorage)[0] ?? 'kt-table-view:1:u30:b77'
    window.localStorage.setItem(key, 'not json')
    expect(() => loadViewState(77, 30)).not.toThrow()
    expect(loadViewState(77, 30)).toEqual(EMPTY_VIEW_STATE)
  })

  it('survives storage being unavailable, as in a private window', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadViewState(77, 30)).toEqual(EMPTY_VIEW_STATE)
    expect(() => saveViewState(77, 30, EMPTY_VIEW_STATE)).not.toThrow()
  })

  it('fills in fields added since the state was written', () => {
    const key = 'kt-table-view:1:u30:b77'
    window.localStorage.setItem(key, JSON.stringify({ version: 1, groupBy: 'priority' }))
    const loaded = loadViewState(77, 30)
    expect(loaded.groupBy).toBe('priority')
    expect(loaded.filters).toEqual({})
    expect(loaded.collapsedGroups).toEqual([])
  })
})
