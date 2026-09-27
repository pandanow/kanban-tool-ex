import { afterEach, describe, expect, it, vi } from 'vitest'
import { close, isOpen, open } from '../../src/ui/overlay'
import { closeFiles, installFilesButton, isFilesOpen } from '../../src/ui/files'
import { imageFiles, isImage } from '../../src/kt/taskFiles'
import { board, task } from '../fixtures/board'
import { closeFakeTaskView, installFakeCards, installFakeKT, setupBoardPage } from './fakeKT'

const ATTACHMENTS = [
  { id: 1, name: 'mockup.png', content_type: 'image/png', size: 2048, url: '/files/1/mockup.png' },
  { id: 2, name: 'spec.pdf', content_type: 'application/pdf', size: 9000, url: '/files/2/spec.pdf' },
  { id: 3, name: 'photo.jpg', content_type: 'image/jpeg', size: 3_500_000, url: '/files/3/photo.jpg' },
]

const settle = async (): Promise<void> => {
  for (let i = 0; i < 2; i++) {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

const q = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector)
const all = (selector: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(selector)]
const key = (name: string): void => {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
}

const start = async (attachments: unknown = ATTACHMENTS): Promise<void> => {
  window.localStorage.clear()
  setupBoardPage()
  installFakeKT(board, [
    task({ id: 1, name: 'Fix login', workflow_stage_id: 1, attachments }),
    task({ id: 2, name: 'Write docs', workflow_stage_id: 1 }),
  ])
  installFakeCards([1, 2])
  installFilesButton()
  await settle()
}

const openCardOnBoard = async (id = 1): Promise<void> => {
  q(`kt-task[data-id="${id}"]`)?.click()
  await settle()
}

const openFilesDialog = async (): Promise<void> => {
  q('kt-taskview .ktv-files-button')?.click()
  await settle()
}

afterEach(() => {
  closeFiles()
  close()
  closeFakeTaskView()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('the Files button', () => {
  it('appears on a card opened from the board', async () => {
    await start()
    await openCardOnBoard()
    expect(all('kt-taskview .ktv-files-button')).toHaveLength(1)
    expect(q('kt-taskview .ktv-files-button')?.textContent).toBe('Browse files')
  })

  it('sits beside the Attachments heading', async () => {
    await start()
    await openCardOnBoard()
    const heading = q('kt-taskview kt-task-attachments')?.parentElement?.querySelector('label')
    expect(heading?.querySelector('.ktv-files-button')).not.toBeNull()
    expect(heading?.firstChild?.textContent).toBe('Attachments')
  })

  it('does not open the file picker through the heading when clicked', async () => {
    await start()
    await openCardOnBoard()
    const heading = q('kt-taskview label') as HTMLElement
    const onHeading = vi.fn()
    heading.addEventListener('click', onHeading)
    q('kt-taskview .ktv-files-button')?.click()
    expect(onHeading).not.toHaveBeenCalled()
    expect(isFilesOpen()).toBe(true)
  })

  it('goes above the attachments section when there is no heading', async () => {
    await start()
    await openCardOnBoard()
    q('kt-taskview label')?.remove()
    await settle()
    const button = all('kt-taskview .ktv-files-launch')
    expect(button).toHaveLength(1)
    expect(button[0]?.nextElementSibling?.tagName.toLowerCase()).toBe('kt-task-attachments')
  })

  it('goes back beside the heading when the host redraws the section', async () => {
    await start()
    await openCardOnBoard()
    const row = q('kt-taskview kt-task-attachments')?.parentElement as HTMLElement
    row.innerHTML = '<label>Attachments</label><kt-task-attachments></kt-task-attachments>'
    await settle()
    expect(all('kt-taskview .ktv-files-button')).toHaveLength(1)
    expect(row.querySelector('label .ktv-files-button')).not.toBeNull()
  })

  it('appears on a card opened from the table', async () => {
    await start()
    await open()
    await settle()
    q('.ktv-row-body .ktv-open')?.click()
    await settle()
    expect(all('kt-taskview .ktv-files-button')).toHaveLength(1)
  })

  it('goes at the top of a card with no attachments section', async () => {
    await start()
    await openCardOnBoard()
    const taskview = q('kt-taskview') as HTMLElement
    taskview.innerHTML = 'Task #1, redrawn'
    await settle()
    expect(all('kt-taskview .ktv-files-button')).toHaveLength(1)
    expect(q('kt-taskview')?.firstElementChild?.classList.contains('ktv-files-launch')).toBe(true)
  })
})

describe('the Files dialog', () => {
  it("lists only the card's images, as previews", async () => {
    await start()
    await openCardOnBoard()
    await openFilesDialog()
    expect(isFilesOpen()).toBe(true)
    const thumbs = all('.ktv-files-thumb img')
    expect(thumbs.map((img) => img.getAttribute('alt'))).toEqual(['mockup.png', 'photo.jpg'])
    expect(thumbs[0]?.getAttribute('src')).toMatch(/^https?:\/\/.+\/files\/1\/mockup\.png$/)
    expect(q('.ktv-files-title')?.textContent).toBe('Files (2)')
  })

  it('shows a file full size, and the arrows step through them and wrap', async () => {
    await start()
    await openCardOnBoard()
    await openFilesDialog()
    all('.ktv-files-thumb')[0]?.click()
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('mockup.png')
    expect(q('.ktv-files-viewer-count')?.textContent).toBe('1 / 2')

    q('.ktv-files-next')?.click()
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('photo.jpg')

    q('.ktv-files-next')?.click()
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('mockup.png')

    q('.ktv-files-prev')?.click()
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('photo.jpg')
  })

  it('steps with the arrow keys', async () => {
    await start()
    await openCardOnBoard()
    await openFilesDialog()
    all('.ktv-files-thumb')[0]?.click()
    await settle()
    key('ArrowRight')
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('photo.jpg')
    key('ArrowLeft')
    await settle()
    expect(q('.ktv-files-full')?.getAttribute('alt')).toBe('mockup.png')
  })

  it('takes Escape one step at a time, and never lets it reach the card or the table', async () => {
    await start()
    await open()
    await settle()
    q('.ktv-row-body .ktv-open')?.click()
    await settle()
    const hostEscape = vi.fn()
    document.addEventListener('keydown', hostEscape)

    await openFilesDialog()
    all('.ktv-files-thumb')[1]?.click()
    await settle()

    key('Escape')
    await settle()
    expect(q('.ktv-files-viewer')).toBeNull()
    expect(q('.ktv-files-grid')).not.toBeNull()

    key('Escape')
    await settle()
    expect(isFilesOpen()).toBe(false)
    expect(hostEscape).not.toHaveBeenCalled()
    expect(isOpen()).toBe(true)
    document.removeEventListener('keydown', hostEscape)
  })

  it('keeps its clicks from reaching the page behind it', async () => {
    await start()
    await openCardOnBoard()
    const outside = vi.fn()
    document.addEventListener('click', outside)
    await openFilesDialog()
    outside.mockClear()
    all('.ktv-files-thumb')[0]?.click()
    expect(outside).not.toHaveBeenCalled()
    document.removeEventListener('click', outside)
  })

  it('closes when the card does', async () => {
    await start()
    await openCardOnBoard()
    await openFilesDialog()
    closeFakeTaskView()
    await settle()
    expect(isFilesOpen()).toBe(false)
    expect(q('.ktv-files-root')).toBeNull()
  })

  it('asks the API when the board model does not carry attachments', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: 1, attachments: ATTACHMENTS })))
    vi.stubGlobal('fetch', fetch)
    await start(null)
    await openCardOnBoard()
    await openFilesDialog()
    expect(fetch).toHaveBeenCalledWith('/api/v3/tasks/1.json', expect.objectContaining({ credentials: 'same-origin' }))
    expect(all('.ktv-files-thumb')).toHaveLength(2)
  })

  it('says so when the files cannot be loaded, rather than showing an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    await start(null)
    await openCardOnBoard()
    await openFilesDialog()
    expect(q('.ktv-files-empty')?.textContent).toBe("Could not load this card's files.")
  })

  it('says so when the card has no images', async () => {
    await start([ATTACHMENTS[1]])
    await openCardOnBoard()
    await openFilesDialog()
    expect(q('.ktv-files-empty')?.textContent).toBe('No image files on this card.')
  })
})

describe('which attachments are images', () => {
  it('goes by MIME type, falling back to the extension only for untyped uploads', () => {
    expect(isImage('image/webp', 'a.bin')).toBe(true)
    expect(isImage('application/pdf', 'a.png')).toBe(false)
    expect(isImage('application/octet-stream', 'scan.JPG')).toBe(true)
    expect(isImage('', 'notes.txt')).toBe(false)
  })

  it('skips entries without a url, and anything that is not a list', () => {
    expect(imageFiles(null)).toEqual([])
    expect(imageFiles([{ name: 'x.png', content_type: 'image/png' }])).toEqual([])
  })
})
