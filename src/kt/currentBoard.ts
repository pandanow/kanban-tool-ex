// Works out which board the page is showing, then hands back a fully loaded model.
//
// The SDK documents `KT.boards.load(id, cb)` but not how to discover the id of the
// board currently on screen, so we try the cheap, safe sources in order and stop at the
// first that answers. `load` is called either way: it is the documented way to be sure
// the board's tasks, stages, swimlanes and settings are actually present.
//
// CONFIRMED on a real board: <kt-board> carries `data-board-id`, so the DOM route is
// the reliable one. `KT.boards.current` is still tried first (it costs nothing and is
// exact when present) and the URL is kept as a last resort for pages that render the
// board without that attribute.

import { getKT, warn } from './env'
import { BOARD_ELEMENT } from './selectors'
import type { KTBoard, KTBoardCollection } from './types'

/** Confirmed on a real board: `data-board-id`. The others are cheap insurance. */
const BOARD_ID_ATTRIBUTES = ['data-board-id', 'board-id', 'data-id'] as const
const URL_PATTERNS = [/\/b\/(\d+)/, /\/boards?\/(\d+)/, /board_id=(\d+)/]

export function boardIdFromDom(root: ParentNode = document): number | null {
  const element = root.querySelector<HTMLElement>(BOARD_ELEMENT)
  if (!element) return null
  for (const attribute of BOARD_ID_ATTRIBUTES) {
    const raw = element.getAttribute(attribute)
    const id = raw === null ? Number.NaN : Number(raw)
    if (Number.isFinite(id) && id > 0) return id
  }
  return null
}

export function boardIdFromUrl(url: string): number | null {
  for (const pattern of URL_PATTERNS) {
    const match = pattern.exec(url)
    if (match?.[1]) {
      const id = Number(match[1])
      if (Number.isFinite(id) && id > 0) return id
    }
  }
  return null
}

function loadedBoard(boards: KTBoardCollection): KTBoard | null {
  if (boards.current) return boards.current
  const models = boards.models ?? []
  return models.length === 1 ? (models[0] ?? null) : null
}

export function currentBoardId(): number | null {
  const kt = getKT()
  const known = kt ? loadedBoard(kt.boards) : null
  if (known) return known.get('id')
  return boardIdFromDom() ?? boardIdFromUrl(window.location.href)
}

export function loadCurrentBoard(): Promise<KTBoard | null> {
  const kt = getKT()
  if (!kt) return Promise.resolve(null)

  const boardId = currentBoardId()
  if (boardId === null) {
    warn('could not determine which board is on screen')
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (board: KTBoard | null): void => {
      if (settled) return
      settled = true
      resolve(board)
    }
    // A board that never loads must not leave the user staring at a dead button.
    const timeout = window.setTimeout(() => {
      warn('timed out loading board', boardId)
      finish(loadedBoard(kt.boards))
    }, 15000)

    try {
      kt.boards.load(boardId, (board) => {
        window.clearTimeout(timeout)
        finish(board)
      })
    } catch (err) {
      window.clearTimeout(timeout)
      warn('KT.boards.load failed', err)
      finish(loadedBoard(kt.boards))
    }
  })
}
