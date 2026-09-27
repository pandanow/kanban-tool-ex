import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDuration,
  parseDate,
  parseDuration,
  parsePriority,
  parseSelectOptions,
  parseTags,
  priorityLabel,
  serializeTags,
  toBoolean,
  toNumber,
} from '../src/model/format'

describe('priority', () => {
  it('labels the documented values', () => {
    expect(priorityLabel(-1)).toBe('Low')
    expect(priorityLabel(0)).toBe('Normal')
    expect(priorityLabel(1)).toBe('High')
  })

  it('accepts labels and numbers, rejects anything else', () => {
    expect(parsePriority('High')).toBe(1)
    expect(parsePriority('high')).toBe(1)
    expect(parsePriority('-1')).toBe(-1)
    expect(parsePriority('urgent')).toBeNull()
    expect(parsePriority('7')).toBeNull()
  })
})

describe('tags', () => {
  it('round-trips the comma-separated form the API stores', () => {
    expect(parseTags('bug,chrome,something-else')).toEqual(['bug', 'chrome', 'something-else'])
    expect(serializeTags(['bug', 'chrome'])).toBe('bug,chrome')
  })

  it('trims, drops blanks and de-duplicates', () => {
    expect(parseTags(' a , , b ')).toEqual(['a', 'b'])
    expect(serializeTags([' a ', 'a', ''])).toBe('a')
  })

  it('treats a missing value as no tags', () => {
    expect(parseTags(null)).toEqual([])
    expect(parseTags('')).toEqual([])
  })
})

describe('durations', () => {
  it('renders seconds the way a person writes them', () => {
    expect(formatDuration(7200)).toBe('2h')
    expect(formatDuration(9000)).toBe('2h 30m')
    expect(formatDuration(600)).toBe('10m')
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(null)).toBe('')
  })

  it('parses back to seconds, reading a bare number as minutes', () => {
    expect(parseDuration('2h 30m')).toBe(9000)
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('45m')).toBe(2700)
    expect(parseDuration('90')).toBe(5400)
  })

  it('round-trips', () => {
    for (const seconds of [60, 600, 3600, 9000, 45296]) {
      const text = formatDuration(seconds)
      expect(parseDuration(text)).toBe(Math.round(seconds / 60) * 60)
    }
  })

  it('rejects nonsense rather than saving a wrong number', () => {
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration('2 hours')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })
})

describe('dates', () => {
  it('keeps Y-m-d exactly, with no timezone shifting', () => {
    expect(formatDate('2026-10-01')).toBe('2026-10-01')
    expect(formatDate('2026-10-01T12:00:00Z')).toBe('2026-10-01')
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
  })

  it('only accepts Y-m-d on the way in', () => {
    expect(parseDate('2026-10-01')).toBe('2026-10-01')
    expect(parseDate('01/10/2026')).toBeNull()
    expect(parseDate('')).toBeNull()
  })
})

describe('select options', () => {
  it('splits on newlines when the textarea form is used', () => {
    expect(parseSelectOptions('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('falls back to commas for older boards', () => {
    expect(parseSelectOptions('a, b, c')).toEqual(['a', 'b', 'c'])
  })

  it('accepts an array unchanged', () => {
    expect(parseSelectOptions(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('treats an unset value as no options', () => {
    expect(parseSelectOptions(undefined)).toEqual([])
    expect(parseSelectOptions('')).toEqual([])
  })
})

describe('loose scalars', () => {
  it('reads the several shapes board settings use for booleans', () => {
    expect(toBoolean(true)).toBe(true)
    expect(toBoolean(1)).toBe(true)
    expect(toBoolean('1')).toBe(true)
    expect(toBoolean(0)).toBe(false)
    expect(toBoolean(undefined)).toBe(false)
  })

  it('distinguishes empty from zero', () => {
    expect(toNumber('')).toBeNull()
    expect(toNumber(null)).toBeNull()
    expect(toNumber(0)).toBe(0)
    expect(toNumber('3.5')).toBe(3.5)
    expect(toNumber('abc')).toBeNull()
  })
})
