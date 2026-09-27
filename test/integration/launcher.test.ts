import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { board, task } from '../fixtures/board'
import { closeFakeTaskView, installFakeCards, installFakeKT, removeHeader, setupBoardPage } from './fakeKT'

// The launcher keeps module-level state (whether the context menu entry was added), so
// each test gets a fresh copy of the module.
async function freshLauncher(): Promise<typeof import('../../src/ui/launcher')> {
  vi.resetModules()
  return import('../../src/ui/launcher')
}

const launchButton = (): HTMLElement | null => document.getElementById('ktv-launch-button')

/** Preact flushes effects after a frame; the store subscription is not attached before. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  window.localStorage.clear()
  setupBoardPage()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the launch button', () => {
  it('goes into the navbar link group beside Share and Settings', async () => {
    installFakeKT(board, [task()])
    const launcher = await freshLauncher()
    launcher.installLauncher()

    const button = launchButton()
    expect(button).not.toBeNull()
    expect(button?.parentElement?.className).toBe('_links')
    expect(button?.tagName).toBe('A')
    expect(button?.classList.contains('ktv-launch-floating')).toBe(false)
    // Sits with the existing links rather than replacing them.
    expect([...(button?.parentElement?.children ?? [])].map((el) => el.textContent)).toEqual([
      'Share',
      'Settings',
      'Help',
      'Table',
    ])
  })

  it('floats over the page when no header matches, so it is still reachable', async () => {
    removeHeader()
    installFakeKT(board, [task()])
    const launcher = await freshLauncher()
    launcher.installLauncher()

    const button = launchButton()
    expect(button).not.toBeNull()
    expect(button?.classList.contains('ktv-launch-floating')).toBe(true)
    expect(button?.parentElement).toBe(document.body)
  })

  it('opens the table when clicked', async () => {
    removeHeader()
    installFakeKT(board, [task({ name: 'Fix login' })])
    const launcher = await freshLauncher()
    launcher.installLauncher()

    launchButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(document.querySelector('.ktv-root')).not.toBeNull()
    expect(document.body.textContent).toContain('Fix login')
  })

  it('does not add a second button when mounted again', async () => {
    installFakeKT(board, [task()])
    const launcher = await freshLauncher()
    launcher.installLauncher()
    launcher.mountLaunchButton()
    launcher.mountLaunchButton()

    expect(document.querySelectorAll('#ktv-launch-button')).toHaveLength(1)
  })

  it('moves into the navbar if it appears later', async () => {
    const navbar = document.querySelector('.navbar') as HTMLElement
    navbar.remove()
    installFakeKT(board, [task()])
    const launcher = await freshLauncher()
    launcher.installLauncher()
    expect(launchButton()?.classList.contains('ktv-launch-floating')).toBe(true)

    document.body.prepend(navbar)
    launcher.mountLaunchButton()

    expect(document.querySelectorAll('#ktv-launch-button')).toHaveLength(1)
    expect(launchButton()?.classList.contains('ktv-launch-floating')).toBe(false)
    expect(launchButton()?.parentElement?.className).toBe('_links')
  })
})

describe('the right-click entry', () => {
  it('registers on a contextMenu that only has push, without throwing', async () => {
    const kt = installFakeKT(board, [task()])
    const pushed: unknown[] = []
    // What a real board actually provides: push, and no array methods.
    ;(kt.Elements as { Board: unknown }).Board = {
      contextMenu: { push: (entry: unknown) => pushed.push(entry) },
    }

    const launcher = await freshLauncher()
    expect(() => launcher.installLauncher()).not.toThrow()
    expect(pushed).toHaveLength(1)
    expect((pushed[0] as { name: string }).name).toBe('Table view')
  })

  it('registers only once', async () => {
    const kt = installFakeKT(board, [task()])
    const pushed: unknown[] = []
    ;(kt.Elements as { Board: unknown }).Board = {
      contextMenu: { push: (entry: unknown) => pushed.push(entry) },
    }

    const launcher = await freshLauncher()
    launcher.installLauncher()
    launcher.registerContextMenu()
    expect(pushed).toHaveLength(1)
  })

  it('carries on when contextMenu cannot be pushed to', async () => {
    const kt = installFakeKT(board, [task()])
    ;(kt.Elements as { Board: unknown }).Board = { contextMenu: {} }

    const launcher = await freshLauncher()
    expect(() => launcher.installLauncher()).not.toThrow()
    // The button is what keeps the feature reachable.
    expect(launchButton()).not.toBeNull()
  })

  it('carries on when KT.Elements.Board is missing entirely', async () => {
    const kt = installFakeKT(board, [task()])
    ;(kt.Elements as { Board?: unknown }).Board = undefined

    const launcher = await freshLauncher()
    expect(() => launcher.installLauncher()).not.toThrow()
    expect(launchButton()).not.toBeNull()
  })
})

describe('setup resilience', () => {
  it('still installs later steps when an earlier one throws', async () => {
    const kt = installFakeKT(board, [task()])
    // The exact failure seen on the real board: contextMenu present but hostile.
    ;(kt.Elements as { Board: unknown }).Board = {
      get contextMenu() {
        throw new TypeError('nope')
      },
    }

    const launcher = await freshLauncher()
    expect(() => launcher.installLauncher()).not.toThrow()
    expect(launchButton()).not.toBeNull()
  })
})

describe('while the table is open', () => {
  it('marks the body so the floating launcher hides itself', async () => {
    removeHeader()
    installFakeKT(board, [task()])
    const launcher = await freshLauncher()
    launcher.installLauncher()

    launchButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body.classList.contains('ktv-open')).toBe(true)

    const backToBoard = [...document.querySelectorAll('.ktv-toolbar button')].find(
      (b) => b.textContent === 'Back to board',
    )
    backToBoard?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(document.body.classList.contains('ktv-open')).toBe(false)
    expect(document.querySelector('.ktv-root')).toBeNull()
    expect(launchButton()).not.toBeNull()
  })
})

describe('Escape', () => {
  /** Opens the table through the launcher, the way a user does. */
  async function openTable(): Promise<void> {
    removeHeader()
    installFakeKT(board, [task({ id: 1, name: 'Fix login' })])
    installFakeCards([1])
    const launcher = await freshLauncher()
    launcher.installLauncher()
    launchButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    await settle()
  }

  const pressEscape = (): void => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  }

  it('closes the table', async () => {
    await openTable()
    pressEscape()
    expect(document.querySelector('.ktv-root')).toBeNull()
  })

  it('belongs to the card while one is open over the table', async () => {
    await openTable()
    const openCard = document.querySelector('.ktv-row-body .ktv-open') as HTMLElement
    openCard.click()
    await settle()
    expect(document.querySelector('kt-taskview')).not.toBeNull()

    // The host closes its own task view on Escape; closing the table underneath it in
    // the same keystroke would drop the user two levels out.
    pressEscape()
    expect(document.querySelector('.ktv-root')).not.toBeNull()

    // Once the card is gone, Escape is the table's again.
    closeFakeTaskView()
    await settle()
    pressEscape()
    expect(document.querySelector('.ktv-root')).toBeNull()
  })

  it('stays in the table when the keystroke that closed the card reaches it late', async () => {
    await openTable()
    ;(document.querySelector('.ktv-row-body .ktv-open') as HTMLElement).click()
    await settle()

    // The keystroke begins here...
    const escape = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    // ...the host closes its own task view on it, and the mutation telling us so is
    // delivered before our listener is called, which is the order a real board gives.
    closeFakeTaskView()
    await settle()
    document.dispatchEvent(escape)

    expect(document.querySelector('kt-taskview')).not.toBeNull()
    expect(document.querySelector('.ktv-root')).not.toBeNull()
  })
})

describe('inspect()', () => {
  it('reports on the page whether or not a card is open, without throwing', async () => {
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      removeHeader()
      installFakeKT(board, [task({ id: 1, name: 'Fix login' })])
      installFakeCards([1])
      const launcher = await freshLauncher()
      launcher.installLauncher()
      expect(() => launcher.inspect()).not.toThrow()

      launchButton()?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await settle()
      ;(document.querySelector('.ktv-row-body .ktv-open') as HTMLElement).click()
      await settle()
      expect(() => launcher.inspect()).not.toThrow()
    } finally {
      quiet.mockRestore()
    }
  })
})
