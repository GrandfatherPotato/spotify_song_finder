import { describe, expect, it } from 'vitest'
import {
  BUCKET,
  bucketForSpan,
  customRange,
  daysBetween,
  inclusiveEnd,
  rangeKey,
  yearRange,
  yearsCovered,
} from './range'

describe('yearRange', () => {
  it('runs from the first day of the year to the first day of the next, exclusive', () => {
    expect(yearRange(2024)).toEqual({ start: '2024-01-01', end: '2025-01-01' })
  })

  it('leaves no gap and no overlap between consecutive years', () => {
    expect(yearRange(2024).end).toBe(yearRange(2025).start)
  })
})

describe('yearsCovered', () => {
  it('lists every year the export touches, newest first', () => {
    expect(yearsCovered('2018-03-05', '2021-11-14')).toEqual([2021, 2020, 2019, 2018])
  })

  it('returns the single year an export inside one year covers', () => {
    expect(yearsCovered('2026-01-01', '2026-04-01')).toEqual([2026])
  })

  it('reads the year in UTC, not the timezone the browser happens to be in', () => {
    expect(yearsCovered('2024-01-01', '2024-12-31')).toEqual([2024])
  })

  it('offers nothing for an export with no plays', () => {
    expect(yearsCovered('', '')).toEqual([])
  })
})

describe('customRange', () => {
  it('makes the end date the user picked inclusive by moving the bound past it', () => {
    expect(customRange('2024-03-01', '2024-03-31')).toEqual({
      start: '2024-03-01',
      end: '2024-04-01',
    })
  })

  it('accepts a single day as a range covering that day', () => {
    expect(customRange('2024-03-01', '2024-03-01')).toEqual({
      start: '2024-03-01',
      end: '2024-03-02',
    })
  })

  it('crosses a leap day without losing one', () => {
    expect(customRange('2024-02-28', '2024-02-29')).toEqual({
      start: '2024-02-28',
      end: '2024-03-01',
    })
  })

  it('refuses a range that ends before it starts', () => {
    expect(customRange('2024-03-31', '2024-03-01')).toBeNull()
  })

  it('refuses a date that is not a date', () => {
    expect(customRange('', '2024-03-01')).toBeNull()
    expect(customRange('2024-03-01', '')).toBeNull()
    expect(customRange('2024-02-30', '2024-03-01')).toBeNull()
  })
})

describe('bucketForSpan', () => {
  it('goes daily for a single year, which fits the budget comfortably', () => {
    expect(bucketForSpan('2024-01-01', '2025-01-01')).toBe(BUCKET.day)
  })

  it('goes weekly for a real nine-year export rather than collapsing to months', () => {
    expect(bucketForSpan('2018-03-05', '2026-11-14')).toBe(BUCKET.week)
  })

  it('falls back to months only once weeks would overrun the budget', () => {
    expect(bucketForSpan('2000-01-01', '2026-01-01')).toBe(BUCKET.month)
  })

  it('coarsens as the budget shrinks, for a chart carrying many series', () => {
    expect(bucketForSpan('2018-03-05', '2026-11-14', 100)).toBe(BUCKET.month)
  })

  it('falls back to months when the span is not readable', () => {
    expect(bucketForSpan('', '')).toBe(BUCKET.month)
  })
})

describe('daysBetween', () => {
  it('counts whole days across a leap year', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2)
  })

  it('refuses a span it cannot read', () => {
    expect(daysBetween('2024-02-30', '2024-03-01')).toBeNull()
  })
})

describe('inclusiveEnd', () => {
  it('turns the exclusive query bound back into the day the user picked', () => {
    expect(inclusiveEnd({ start: '2024-03-01', end: '2024-04-01' })).toBe('2024-03-31')
  })
})

describe('rangeKey', () => {
  it('names the absence of a range rather than keying on an empty string', () => {
    expect(rangeKey(null)).toBe('all-time')
  })

  it('tells two ranges apart', () => {
    expect(rangeKey(yearRange(2024))).not.toBe(rangeKey(yearRange(2025)))
  })
})
