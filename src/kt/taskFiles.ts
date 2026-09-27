// The image files attached to a card, for the Files dialog.
//
// API v3 has no endpoint that lists attachments on their own. They come back as the
// `attachments` field of the task itself, `GET /api/v3/tasks/:id.json`, each one
// `{ id, name, content_type, size, url }` with `url` a path relative to the site. The
// script runs inside the user's own session, so the request carries their cookies and
// needs no token - the same reason the rest of this extension needs none.
//
// The board's Backbone model is asked first, since a model that already carries its
// attachments saves a request; on a board it usually does not, and the API answers.
//
// CONFIRM on the pilot board: that `/api/v3/tasks/:id.json` answers a session-cookie
// request (the docs only show bearer tokens). A refusal is logged with its status, and
// the dialog says it could not load the files rather than showing an empty list.

import { getKT, log } from './env'

export interface TaskFile {
  id: number
  name: string
  /** Absolute, so it can go straight into an `<img src>`. */
  url: string
  contentType: string
  size: number | null
}

interface RawAttachment {
  id?: unknown
  name?: unknown
  content_type?: unknown
  size?: unknown
  url?: unknown
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i

/**
 * Whether an attachment can be shown as a picture. The MIME type decides when there is
 * one; the extension is the fallback for uploads the server typed as octet-stream.
 */
export function isImage(contentType: string, name: string): boolean {
  if (contentType.startsWith('image/')) return true
  if (contentType && contentType !== 'application/octet-stream') return false
  return IMAGE_EXTENSION.test(name)
}

function absolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

/** The image attachments out of whatever shape the model or the API handed back. */
export function imageFiles(attachments: unknown): TaskFile[] {
  if (!Array.isArray(attachments)) return []
  const files: TaskFile[] = []
  for (const raw of attachments as RawAttachment[]) {
    if (!raw || typeof raw.url !== 'string' || !raw.url) continue
    const name = typeof raw.name === 'string' ? raw.name : raw.url.split('/').pop() ?? ''
    const contentType = typeof raw.content_type === 'string' ? raw.content_type : ''
    if (!isImage(contentType, name)) continue
    files.push({
      id: typeof raw.id === 'number' ? raw.id : files.length,
      name,
      url: absolute(raw.url),
      contentType,
      size: typeof raw.size === 'number' ? raw.size : null,
    })
  }
  return files
}

function fromModel(taskId: number): unknown {
  const model = getKT()?.tasks?.get(taskId)
  return model?.get('attachments')
}

/** The task out of an API answer, which may or may not be wrapped in `{ task: ... }`. */
function taskOf(body: unknown): { attachments?: unknown } | null {
  if (!body || typeof body !== 'object') return null
  const wrapped = (body as { task?: unknown }).task
  if (wrapped && typeof wrapped === 'object') return wrapped as { attachments?: unknown }
  return body as { attachments?: unknown }
}

/** Every image attached to the card. Rejects when the files could not be loaded at all. */
export async function loadTaskImages(taskId: number): Promise<TaskFile[]> {
  const cached = fromModel(taskId)
  if (Array.isArray(cached)) return imageFiles(cached)

  const response = await fetch(`/api/v3/tasks/${taskId}.json`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    log(`attachments for task ${taskId}: the API answered ${response.status}`)
    throw new Error(`HTTP ${response.status}`)
  }
  const files = imageFiles(taskOf(await response.json())?.attachments)
  log(`attachments for task ${taskId}: ${files.length} image(s)`)
  return files
}
