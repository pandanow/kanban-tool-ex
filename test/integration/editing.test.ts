import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { close, open } from '../../src/ui/overlay'
import { board, task } from '../fixtures/board'
import { installFakeKT, setupBoardPage, type FakeKT } from './fakeKT'

let kt: FakeKT

const settle = async (): Promise<void> => {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

const headerLabels = (): string[] =>
  [...document.querySelectorAll('.ktv-head .ktv-cell')].map((el) => el.textContent ?? '')

/** The cell at (row index, column label) as the user sees the table. */
function cell(rowIndex: number, columnLabel: string): HTMLElement {
  const index = headerLabels().findIndex((label) => label.startsWith(columnLabel))
  if (index === -1) throw new Error(`no column "${columnLabel}" (have: ${headerLabels().join(', ')})`)
  const row = document.querySelectorAll('.ktv-row-body')[rowIndex]
  if (!row) throw new Error(`no row ${rowIndex}`)
  const cells = row.querySelectorAll('.ktv-cell')
  const found = cells[index]
  if (!found) throw new Error(`no cell ${index} in row ${rowIndex}`)
  return found as HTMLElement
}

function click(element: Element): void {
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
}

async function startEditing(rowIndex: number, columnLabel: string): Promise<HTMLElement> {
  const target = cell(rowIndex, columnLabel)
  const value = target.querySelector('.ktv-cell-value')
  click(value ?? target)
  await settle()
  const editor = target.querySelector('.ktv-cell-editor')
  if (!editor) throw new Error(`cell "${columnLabel}" did not open an editor`)
  return editor as HTMLElement
}

async function typeAndCommit(editor: HTMLElement, text: string): Promise<void> {
  ;(editor as HTMLInputElement).value = text
  editor.dispatchEvent(new window.Event('input', { bubbles: true }))
  editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await settle()
}

beforeEach(async () => {
  // View preferences persist per user and board, so without this a test inherits the
  // grouping, filters and column choices the previous one left behind.
  window.localStorage.clear()
  setupBoardPage()
  kt = installFakeKT(board, [
    task({ id: 1, name: 'Fix login', workflow_stage_id: 1, time_estimate: 3600 }),
    task({ id: 2, name: 'Write docs', workflow_stage_id: 1, time_estimate: null }),
  ])
  await open()
  await settle()
})

afterEach(() => {
  close()
  document.body.innerHTML = ''
})

describe('editing a cell', () => {
  it('saves a text edit to the card', async () => {
    const editor = await startEditing(0, 'Card')
    await typeAndCommit(editor, 'Fix login for real')

    expect(kt.tasks.get(1)?.saves).toEqual([{ name: 'Fix login for real' }])
    expect(kt.tasks.get(1)?.get('name')).toBe('Fix login for real')
  })

  it('shows the saved value in the table afterwards', async () => {
    const editor = await startEditing(0, 'Card')
    await typeAndCommit(editor, 'Renamed')
    expect(document.body.textContent).toContain('Renamed')
  })

  it('converts a typed duration to seconds before saving', async () => {
    const editor = await startEditing(0, 'Estimate')
    await typeAndCommit(editor, '2h 30m')
    expect(kt.tasks.get(1)?.saves).toEqual([{ time_estimate: 9000 }])
  })

  it('saves a dropdown choice as the underlying id', async () => {
    const editor = await startEditing(0, 'Assignee')
    ;(editor as HTMLSelectElement).value = '31'
    editor.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settle()
    expect(kt.tasks.get(1)?.saves).toEqual([{ assigned_user_id: 31 }])
  })

  it('clears a value when the cell is emptied', async () => {
    const editor = await startEditing(0, 'Estimate')
    await typeAndCommit(editor, '')
    expect(kt.tasks.get(1)?.saves).toEqual([{ time_estimate: null }])
  })

  it('does not save when nothing changed', async () => {
    const editor = await startEditing(0, 'Card')
    await typeAndCommit(editor, 'Fix login')
    expect(kt.tasks.get(1)?.saves).toEqual([])
  })

  it('rejects unparseable input instead of saving it, and says why', async () => {
    const editor = await startEditing(0, 'Estimate')
    await typeAndCommit(editor, 'ages')

    expect(kt.tasks.get(1)?.saves).toEqual([])
    expect(kt.notices.at(-1)?.level).toBe('error')
    expect(kt.notices.at(-1)?.message).toContain('2h 30m')
  })

  it('abandons the edit on Escape', async () => {
    const editor = await startEditing(0, 'Card')
    ;(editor as HTMLInputElement).value = 'Nope'
    editor.dispatchEvent(new window.Event('input', { bubbles: true }))
    editor.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(kt.tasks.get(1)?.saves).toEqual([])
    expect(kt.tasks.get(1)?.get('name')).toBe('Fix login')
  })

  it('will not open an editor on a derived column', async () => {
    const target = cell(0, 'Checklist')
    click(target.querySelector('.ktv-cell-value') ?? target)
    await settle()
    expect(target.querySelector('.ktv-cell-editor')).toBeNull()
  })
})

describe('when the server rejects the write', () => {
  it('puts the old value back and explains', async () => {
    const model = kt.tasks.get(1)
    if (!model) throw new Error('missing task')
    model.failNextSave = { status: 409 }

    const editor = await startEditing(0, 'Card')
    await typeAndCommit(editor, 'Doomed rename')

    expect(model.get('name')).toBe('Fix login')
    expect(document.body.textContent).toContain('Fix login')
    expect(document.body.textContent).not.toContain('Doomed rename')
    expect(kt.notices.at(-1)?.level).toBe('error')
    expect(kt.notices.at(-1)?.message).toContain('changed somewhere else')
  })
})

describe('without permission', () => {
  it('renders cells read-only rather than failing on save', async () => {
    close()
    document.body.innerHTML = ''
    setupBoardPage()
    kt = installFakeKT(board, [task({ id: 1, name: 'Fix login' })], {
      permissions: ['read_tasks'],
    })
    await open()
    await settle()

    const target = cell(0, 'Card')
    expect(target.className).toContain('ktv-cell-readonly')
    click(target.querySelector('.ktv-cell-value') ?? target)
    await settle()
    expect(target.querySelector('.ktv-cell-editor')).toBeNull()
    expect(kt.tasks.get(1)?.saves).toEqual([])
  })
})

describe('editing many cards at once', () => {
  const checkboxes = (): HTMLInputElement[] =>
    [...document.querySelectorAll('.ktv-row-body .ktv-cell-gutter input')] as HTMLInputElement[]

  it('sends one bulk update for the selected rows', async () => {
    for (const box of checkboxes()) click(box)
    await settle()

    const bar = document.querySelector('.ktv-bulkbar')
    expect(bar?.textContent).toContain('2 cards selected')

    const [columnSelect, valueSelect] = [...(bar?.querySelectorAll('select') ?? [])]
    if (!columnSelect || !valueSelect) throw new Error('bulk bar controls missing')

    columnSelect.value = 'assigned_user_id'
    columnSelect.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settle()

    const valueControl = (bar?.querySelectorAll('select') ?? [])[1] as HTMLSelectElement
    valueControl.value = '31'
    valueControl.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settle()

    click([...(bar?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Apply')!)
    await settle()

    expect(kt.tasks.groupUpdates).toEqual([{ ids: [1, 2], attributes: { assigned_user_id: 31 } }])
  })

  it('clears the selection once applied', async () => {
    for (const box of checkboxes()) click(box)
    await settle()
    const bar = document.querySelector('.ktv-bulkbar')
    const valueControl = (bar?.querySelectorAll('select') ?? [])[1] as HTMLSelectElement
    valueControl.value = String(valueControl.options[1]?.value)
    valueControl.dispatchEvent(new window.Event('change', { bubbles: true }))
    await settle()

    click([...(bar?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Apply')!)
    await settle()
    expect(document.querySelector('.ktv-bulkbar')).toBeNull()
  })

  it('does not offer to rename every selected card at once', async () => {
    for (const box of checkboxes()) click(box)
    await settle()
    const options = [
      ...(document.querySelector('.ktv-bulkbar select')?.querySelectorAll('option') ?? []),
    ].map((o) => o.textContent)
    expect(options).not.toContain('Card')
    expect(options).toContain('Stage')
  })

  it('will not clear a field a card cannot be without', async () => {
    for (const box of checkboxes()) click(box)
    await settle()
    const bar = document.querySelector('.ktv-bulkbar')
    // Stage is the default column and no value has been picked yet.
    const apply = [...(bar?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Apply',
    ) as HTMLButtonElement
    expect(apply.disabled).toBe(true)
    click(apply)
    await settle()
    expect(kt.tasks.groupUpdates).toEqual([])
  })
})

describe('filtering', () => {
  const toolbarButton = (label: string): HTMLButtonElement =>
    [...document.querySelectorAll('.ktv-toolbar button')].find((b) =>
      (b.textContent ?? '').startsWith(label),
    ) as HTMLButtonElement

  const filterInput = (columnLabel: string): HTMLInputElement => {
    const index = headerLabels().findIndex((label) => label.startsWith(columnLabel))
    const inputs = document.querySelectorAll('.ktv-filterrow .ktv-filter-input')
    return inputs[index] as HTMLInputElement
  }

  const type = async (input: HTMLInputElement, value: string): Promise<void> => {
    input.value = value
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    await settle()
  }

  it('shows a filter box per column on request', async () => {
    expect(document.querySelector('.ktv-filterrow')).toBeNull()
    click(toolbarButton('Filters'))
    await settle()
    expect(document.querySelectorAll('.ktv-filterrow .ktv-filter-input').length).toBe(
      headerLabels().length,
    )
  })

  it('filters on one column without touching the others', async () => {
    click(toolbarButton('Filters'))
    await settle()
    await type(filterInput('Card'), 'docs')

    expect(document.querySelectorAll('.ktv-row-body')).toHaveLength(1)
    expect(document.body.textContent).toContain('Write docs')
    expect(document.querySelector('.ktv-count')?.textContent).toBe('1 of 2 cards')
  })

  it('matches blank cells with is:empty', async () => {
    click(toolbarButton('Filters'))
    await settle()
    await type(filterInput('Estimate'), 'is:empty')

    expect(document.querySelectorAll('.ktv-row-body')).toHaveLength(1)
    expect(document.body.textContent).toContain('Write docs')
  })

  it('keeps filtering after the filter row is hidden again, and says so', async () => {
    click(toolbarButton('Filters'))
    await settle()
    await type(filterInput('Card'), 'docs')
    click(toolbarButton('Filters'))
    await settle()

    expect(document.querySelector('.ktv-filterrow')).toBeNull()
    expect(document.querySelector('.ktv-count')?.textContent).toBe('1 of 2 cards')
    expect(toolbarButton('Filters').className).toContain('ktv-button-active')
  })
})
