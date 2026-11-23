import type { ComposeOption } from 'echarts/core'
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts'
import type {
  GridComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import type { ProgressionRow } from '../history/duckdb/queries'
import { formatCount } from '../history/format'
import type { Bucket } from '../history/range'
import { tooltipFormatter } from './tooltip'
import { bucketSpine } from './trendOption'

export type ProgressionChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | GridComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>

export const PLAYS_SERIES = 'Plays'
export const CUMULATIVE_SERIES = 'Total to date'

const PLAYS_COLOUR = '#1ed760'
const TOTAL_COLOUR = '#7cc5ff'
const INK = '#8b9186'
const HAIRLINE = 'rgba(232, 236, 230, 0.1)'

export interface ProgressionPoints {
  plays: Array<[string, number]>
  cumulative: Array<[string, number]>
}

export function progressionPoints(
  rows: readonly ProgressionRow[],
  bucket: Bucket,
): ProgressionPoints {
  const spine = bucketSpine(
    rows.map((row) => ({ bucket: row.bucket, id: 0, hours: row.hours })),
    bucket,
  )
  const playsByBucket = new Map<string, number>()
  for (const row of rows) {
    playsByBucket.set(row.bucket, (playsByBucket.get(row.bucket) ?? 0) + row.plays)
  }
  let running = 0
  const plays: Array<[string, number]> = []
  const cumulative: Array<[string, number]> = []
  for (const at of spine) {
    const count = playsByBucket.get(at) ?? 0
    running += count
    plays.push([at, count])
    cumulative.push([at, running])
  }
  return { plays, cumulative }
}

export function progressionOption(
  rows: readonly ProgressionRow[],
  bucket: Bucket,
): ProgressionChartOption {
  const { plays, cumulative } = progressionPoints(rows, bucket)
  return {
    color: [PLAYS_COLOUR, TOTAL_COLOUR],
    animationDuration: 400,
    animationDurationUpdate: 250,
    animationEasing: 'cubicOut',
    animationThreshold: 8000,
    grid: { left: 48, right: 56, top: 48, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: tooltipFormatter(bucket, (value, series) =>
        series === PLAYS_SERIES ? `${formatCount(value)} plays` : `${formatCount(value)} to date`,
      ),
    },
    legend: { top: 0, textStyle: { color: INK }, inactiveColor: 'rgba(232, 236, 230, 0.3)' },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: HAIRLINE } },
      axisLabel: { color: INK },
    },
    yAxis: [
      {
        type: 'value',
        name: 'plays',
        nameTextStyle: { color: INK },
        axisLabel: { color: INK },
        splitLine: { lineStyle: { color: HAIRLINE } },
      },
      {
        type: 'value',
        name: 'total',
        nameTextStyle: { color: INK },
        axisLabel: { color: INK },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        type: 'bar',
        name: PLAYS_SERIES,
        data: plays,
        yAxisIndex: 0,
        large: true,
        barMaxWidth: 24,
      },
      {
        type: 'line',
        name: CUMULATIVE_SERIES,
        data: cumulative,
        yAxisIndex: 1,
        showSymbol: false,
        smooth: false,
        sampling: 'lttb',
        legendHoverLink: false,
        emphasis: { disabled: true },
      },
    ],
  }
}
