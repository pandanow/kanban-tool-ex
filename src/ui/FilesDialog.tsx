// The card's images: a grid of previews, and one image full size with arrows to step
// through the rest. Keyboard handling lives with the caller (src/ui/files.ts), which
// has to win the keystroke from the host's own Escape before any of this sees it.

import { useEffect, useState } from 'preact/hooks'
import { loadTaskImages, type TaskFile } from '../kt/taskFiles'

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ready'; files: TaskFile[] }

export interface FilesDialogProps {
  taskId: number
  /** Which image is shown full size; null for the grid. Owned by the caller. */
  viewing: number | null
  onView: (index: number | null) => void
  onClose: () => void
  /** Told how many files there are, so arrow keys know where to wrap. */
  onLoaded: (count: number) => void
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesDialog({ taskId, viewing, onView, onClose, onLoaded }: FilesDialogProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    loadTaskImages(taskId).then(
      (files) => {
        if (!live) return
        setLoad({ state: 'ready', files })
        onLoaded(files.length)
      },
      () => live && setLoad({ state: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [taskId])

  const files = load.state === 'ready' ? load.files : []
  const current = viewing !== null ? files[viewing] : undefined

  if (current && viewing !== null) {
    const step = (by: number) => onView((viewing + by + files.length) % files.length)
    return (
      <div class="ktv-files-viewer" role="dialog" aria-label={current.name}>
        <div class="ktv-files-viewer-bar">
          <button type="button" class="ktv-files-back" onClick={() => onView(null)}>
            ← All files
          </button>
          <span class="ktv-files-viewer-name" title={current.name}>
            {current.name}
          </span>
          <span class="ktv-files-viewer-count">
            {viewing + 1} / {files.length}
          </span>
          <a class="ktv-files-link" href={current.url} target="_blank" rel="noopener noreferrer">
            Open original
          </a>
          <button type="button" class="ktv-files-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div class="ktv-files-stage" onClick={(event) => event.target === event.currentTarget && onView(null)}>
          {files.length > 1 && (
            <button type="button" class="ktv-files-arrow ktv-files-prev" aria-label="Previous" onClick={() => step(-1)}>
              ‹
            </button>
          )}
          <img class="ktv-files-full" src={current.url} alt={current.name} />
          {files.length > 1 && (
            <button type="button" class="ktv-files-arrow ktv-files-next" aria-label="Next" onClick={() => step(1)}>
              ›
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div class="ktv-files-dialog" role="dialog" aria-label="Files">
      <div class="ktv-files-header">
        <span class="ktv-files-title">
          Files{load.state === 'ready' ? ` (${files.length})` : ''}
        </span>
        <button type="button" class="ktv-files-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div class="ktv-files-body">
        {load.state === 'loading' && <div class="ktv-files-empty">Loading…</div>}
        {load.state === 'failed' && <div class="ktv-files-empty">Could not load this card's files.</div>}
        {load.state === 'ready' && files.length === 0 && (
          <div class="ktv-files-empty">No image files on this card.</div>
        )}
        {files.length > 0 && (
          <ul class="ktv-files-grid">
            {files.map((file, index) => (
              <li key={file.id}>
                <button type="button" class="ktv-files-thumb" title={file.name} onClick={() => onView(index)}>
                  <img src={file.url} alt={file.name} loading="lazy" />
                  <span class="ktv-files-thumb-name">{file.name}</span>
                  <span class="ktv-files-thumb-size">{formatSize(file.size)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
