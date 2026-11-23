import { BUCKET } from '../history/range'
import type { Bucket } from '../history/range'

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Series names are track and artist names straight out of the export, and
 * ECharts renders a tooltip as HTML.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ESCAPES[char] ?? char)
}

/** Says which period the hovered point covers, not just where it starts. */
export function bucketLabel(iso: string, bucket: Bucket): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(parsed)) return iso
  if (bucket === BUCKET.month) return MONTH.format(parsed)
  if (bucket === BUCKET.week) return `Week of ${DAY.format(parsed)}`
  return DAY.format(parsed)
}

interface Point {
  seriesName?: unknown
  marker?: unknown
  value?: unknown
}

function isPoint(value: unknown): value is Point {
  return typeof value === 'object' && value !== null
}

function pointsOf(params: unknown): Point[] {
  if (Array.isArray(params)) return params.filter(isPoint)
  return isPoint(params) ? [params] : []
}

function textAt(point: Point, index: number): string | null {
  const value = point.value
  if (!Array.isArray(value)) return null
  const at: unknown = value[index]
  return typeof at === 'string' ? at : null
}

function numberAt(point: Point, index: number): number | null {
  const value = point.value
  if (!Array.isArray(value)) return null
  const at: unknown = value[index]
  return typeof at === 'number' ? at : null
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export type ValueFormat = (value: number, series: string) => string

export function tooltipFormatter(bucket: Bucket, format: ValueFormat) {
  return (params: unknown): string => {
    const points = pointsOf(params)
    const at = points.map((point) => textAt(point, 0)).find((date) => date !== null)
    const rows = points.flatMap((point) => {
      const value = numberAt(point, 1)
      if (value === null) return []
      const series = asText(point.seriesName)
      return [
        `<div>${asText(point.marker)}${escapeHtml(series)} <b>${escapeHtml(format(value, series))}</b></div>`,
      ]
    })
    if (at === undefined || at === null) return rows.join('')
    return `<div><b>${escapeHtml(bucketLabel(at, bucket))}</b></div>${rows.join('')}`
  }
}
