import type { ComposeOption } from 'echarts/core'
import type { LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { TrendRow } from '../history/duckdb/queries'
import { formatHours } from '../history/format'
import { BUCKET } from '../history/range'
import type { Bucket } from '../history/range'
import { tooltipFormatter } from './tooltip'

export type TrendChartOption = ComposeOption<
  LineSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

const BRAND_HUE = 141

/** Successive hues land as far from every previous one as the circle allows. */
const GOLDEN_ANGLE = 137.508

export function seriesColours(count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => {
    const hue = (BRAND_HUE + index * GOLDEN_ANGLE) % 360
    return `hsl(${hue.toFixed(1)} 68% 62%)`
  })
}

const INK = '#8b9186'
const HAIRLINE = 'rgba(232, 236, 230, 0.1)'

function nextBucket(iso: string, bucket: Bucket): string {
  const date = new Date(`${iso}T00:00:00Z`)
  if (bucket === BUCKET.month) date.setUTCMonth(date.getUTCMonth() + 1)
  else date.setUTCDate(date.getUTCDate() + (bucket === BUCKET.week ? 7 : 1))
  return date.toISOString().slice(0, 10)
}

/**
 * Every bucket between the first and last the result mentions. A week a song
 * was not played is a real zero rather than missing data — the export covers
 * the whole span — and without the spine the line would slope straight across
 * the silence as though it never happened.
 */
export function bucketSpine(rows: readonly TrendRow[], bucket: Bucket): string[] {
  const buckets = rows.map((row) => row.bucket).sort()
  const first = buckets.at(0)
  const last = buckets.at(-1)
  if (first === undefined || last === undefined) return []
  const spine: string[] = []
  for (let at = first; at <= last; at = nextBucket(at, bucket)) spine.push(at)
  return spine
}

export interface TrendSeries {
  name: string
  points: Array<[string, number]>
}

/** Which entities to draw and in what order: the table's ranking, keyed by id. */
export interface TrendSeriesRef {
  id: number
  label: string
}

export function trendSeries(
  rows: readonly TrendRow[],
  refs: readonly TrendSeriesRef[],
  bucket: Bucket,
): TrendSeries[] {
  const spine = bucketSpine(rows, bucket)
  const hoursById = new Map<number, Map<string, number>>()
  for (const row of rows) {
    const hours = hoursById.get(row.id) ?? new Map<string, number>()
    hours.set(row.bucket, (hours.get(row.bucket) ?? 0) + row.hours)
    hoursById.set(row.id, hours)
  }
  return refs.flatMap(({ id, label }) => {
    const hours = hoursById.get(id)
    if (hours === undefined) return []
    return [
      {
        name: label,
        points: spine.map((at): [string, number] => [at, hours.get(at) ?? 0]),
      },
    ]
  })
}

export function trendOption(
  rows: readonly TrendRow[],
  refs: readonly TrendSeriesRef[],
  bucket: Bucket,
): TrendChartOption {
  const series = trendSeries(rows, refs, bucket)
  return {
    color: seriesColours(series.length),
    // ECharts defaults to a second of `cubicOut`, which barely moves for its
    // first few hundred milliseconds: toggling a legend entry back on reads as
    // a hang rather than a redraw. Its default threshold would also switch the
    // animation off entirely once a large board crosses 2,000 points.
    animationDuration: 400,
    animationDurationUpdate: 250,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    animationThreshold: 8000,
    grid: { left: 48, right: 16, top: 48, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      formatter: tooltipFormatter(bucket, (value) => `${formatHours(value)} h`),
    },
    legend: { top: 0, textStyle: { color: INK }, inactiveColor: 'rgba(232, 236, 230, 0.3)' },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: HAIRLINE } },
      axisLabel: { color: INK },
    },
    yAxis: {
      type: 'value',
      name: 'hours',
      nameTextStyle: { color: INK },
      axisLabel: { color: INK },
      splitLine: { lineStyle: { color: HAIRLINE } },
    },
    series: series.map((line) => ({
      type: 'line',
      name: line.name,
      data: line.points,
      showSymbol: false,
      smooth: false,
      sampling: 'lttb',
      // Hovering a legend entry otherwise fades every other line to nothing,
      // which reads as the chart emptying itself.
      legendHoverLink: false,
      emphasis: { disabled: true },
    })),
  }
}
