// Parsing and formatting for every field type the table can show or edit.
//
// Formats are taken from the API v3 object reference:
//   priority        -1 (low) | 0 (normal) | 1 (high)
//   tags            comma-separated string, e.g. "bug,chrome,something-else"
//   due_date        Y-m-d
//   time_estimate   seconds
//   timers_total    seconds
//   size_estimate   decimal number (0.1 easy .. 5.0 five times harder)
//
// Custom field *write* formats are not documented. We send what the board's own UI
// stores: a plain string for text/link/select, Y-m-d for date, a decimal string for
// number, a user id for user, and comma-separated values for a multi-select. See
// CONFIRM notes below - these are the values to verify against a real board in the
// pilot, and this is the only file that needs changing if any of them is wrong.

export const PRIORITIES = [
  { value: -1, label: 'Low' },
  { value: 0, label: 'Normal' },
  { value: 1, label: 'High' },
] as const

export function priorityLabel(value: unknown): string {
  const n = toNumber(value)
  return PRIORITIES.find((p) => p.value === n)?.label ?? ''
}

export function parsePriority(input: string): number | null {
  if (input === '') return null
  const match = PRIORITIES.find(
    (p) => p.label.toLowerCase() === input.trim().toLowerCase(),
  )
  if (match) return match.value
  const n = Number(input)
  return Number.isFinite(n) && n >= -1 && n <= 1 ? n : null
}

export function parseTags(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') return []
  return value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')
}

export function serializeTags(tags: string[]): string {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (trimmed === '' || seen.has(trimmed)) continue
    seen.add(trimmed)
    unique.push(trimmed)
  }
  return unique.join(',')
}

/** Seconds -> "3h 20m". Kanban Tool stores estimates and tracked time in seconds. */
export function formatDuration(seconds: unknown): string {
  const total = toNumber(seconds)
  if (total === null || total <= 0) return ''
  const hours = Math.floor(total / 3600)
  const minutes = Math.round((total % 3600) / 60)
  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

/**
 * "3h 20m" | "3h" | "45m" | "90" (bare number means minutes) -> seconds.
 * Returns null for anything unparseable so the caller can reject the edit.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 60)
  const match = text.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m)?$/)
  if (!match) return null
  const [, h, m] = match
  if (h === undefined && m === undefined) return null
  return Math.round((Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Kanban Tool dates are Y-m-d. We neither localise nor timezone-shift them. */
export function formatDate(value: unknown): string {
  if (typeof value !== 'string' || value === '') return ''
  const datePart = value.slice(0, 10)
  return ISO_DATE.test(datePart) ? datePart : ''
}

export function parseDate(input: string): string | null {
  const text = input.trim()
  if (text === '') return null
  return ISO_DATE.test(text) ? text : null
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  return Number.isFinite(n) ? n : null
}

export function formatNumber(value: unknown): string {
  const n = toNumber(value)
  return n === null ? '' : String(n)
}

/**
 * Board settings store select options either as an array or as a single string split
 * on newlines (how the board settings textarea saves them) or commas on older boards.
 */
export function parseSelectOptions(options: unknown): string[] {
  if (Array.isArray(options)) {
    return options.map((o) => String(o).trim()).filter((o) => o !== '')
  }
  if (typeof options !== 'string' || options.trim() === '') return []
  const separator = options.includes('\n') ? '\n' : ','
  return options
    .split(separator)
    .map((o) => o.trim())
    .filter((o) => o !== '')
}

/** CONFIRM on pilot board: multi-select custom fields are assumed comma-separated. */
export function parseMultiSelectValue(value: unknown): string[] {
  return parseTags(value)
}

export function serializeMultiSelectValue(values: string[]): string {
  return serializeTags(values)
}

export function truncate(text: string, max = 200): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** Board settings booleans arrive as `true`, `1` or `"1"` depending on board age. */
export function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}
