/**
 * Half-open `[start, end)` bounds as `YYYY-MM-DD` strings, never `Date`:
 * nothing converts through a local timezone, so a play at 01:00 on 1 January
 * cannot land in the wrong year. A null `TimeRange` means all time.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface TimeRange {
  start: string
  end: string
}

function isoDay(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10)
}

function utcDate(iso: string): number | null {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed)) return null
  return isoDay(parsed) === iso ? parsed : null
}

export function yearRange(year: number): TimeRange {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` }
}

export function yearsCovered(firstPlay: string, lastPlay: string): number[] {
  const first = utcDate(firstPlay)
  const last = utcDate(lastPlay)
  if (first === null || last === null) return []
  const firstYear = new Date(first).getUTCFullYear()
  const lastYear = new Date(last).getUTCFullYear()
  if (lastYear < firstYear) return []
  const years: number[] = []
  for (let year = lastYear; year >= firstYear; year -= 1) years.push(year)
  return years
}

/** `to` is inclusive to the person picking it, exclusive to the query. */
export function customRange(from: string, to: string): TimeRange | null {
  const start = utcDate(from)
  const end = utcDate(to)
  if (start === null || end === null || end < start) return null
  return { start: isoDay(start), end: isoDay(end + MS_PER_DAY) }
}

/** The last day the range covers, as the date input showed it. */
export function inclusiveEnd(range: TimeRange): string {
  const end = utcDate(range.end)
  return end === null ? '' : isoDay(end - MS_PER_DAY)
}

export function rangeKey(range: TimeRange | null): string {
  return range === null ? 'all-time' : `${range.start}:${range.end}`
}

export const BUCKET = {
  day: 'day',
  week: 'week',
  month: 'month',
} as const

export type Bucket = (typeof BUCKET)[keyof typeof BUCKET]

const DAYS_PER_WEEK = 7

/** Roughly a point every two pixels on a wide chart. */
export const DEFAULT_POINT_BUDGET = 600

export function daysBetween(first: string, last: string): number | null {
  const from = utcDate(first)
  const to = utcDate(last)
  if (from === null || to === null) return null
  return Math.round((to - from) / MS_PER_DAY)
}

/**
 * The finest bucket whose point count still fits the budget, so a span is only
 * coarsened when it has to be. A nine-year export lands on weeks, not months,
 * where a fortnight of heavy listening is still its own peak.
 */
export function bucketForSpan(first: string, last: string, budget = DEFAULT_POINT_BUDGET): Bucket {
  const days = daysBetween(first, last)
  if (days === null) return BUCKET.month
  if (days <= budget) return BUCKET.day
  if (days / DAYS_PER_WEEK <= budget) return BUCKET.week
  return BUCKET.month
}
