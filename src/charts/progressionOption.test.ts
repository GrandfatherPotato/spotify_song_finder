// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BUCKET } from '../history/range'
import {
  CUMULATIVE_SERIES,
  PLAYS_SERIES,
  progressionOption,
  progressionPoints,
} from './progressionOption'

const ROWS = [
  { bucket: '2024-01-01', plays: 4, hours: 0.3 },
  { bucket: '2024-03-01', plays: 6, hours: 0.5 },
]

describe('progressionPoints', () => {
  it('fills a silent bucket with a real zero rather than skipping it', () => {
    expect(progressionPoints(ROWS, BUCKET.month).plays).toEqual([
      ['2024-01-01', 4],
      ['2024-02-01', 0],
      ['2024-03-01', 6],
    ])
  })

  it('runs the total forward and never lets it fall', () => {
    expect(progressionPoints(ROWS, BUCKET.month).cumulative).toEqual([
      ['2024-01-01', 4],
      ['2024-02-01', 4],
      ['2024-03-01', 10],
    ])
  })

  it('carries the total flat through a silence, which is how a drop-off reads', () => {
    const points = progressionPoints(ROWS, BUCKET.month)

    expect(points.cumulative[1][1]).toBe(points.cumulative[0][1])
  })

  it('puts both series on the same buckets', () => {
    const { plays, cumulative } = progressionPoints(ROWS, BUCKET.day)

    expect(plays.map(([at]) => at)).toEqual(cumulative.map(([at]) => at))
  })

  it('has nothing to plot when the item was never played', () => {
    expect(progressionPoints([], BUCKET.week)).toEqual({ plays: [], cumulative: [] })
  })
})

describe('progressionOption', () => {
  it('puts the bars and the running total on separate axes', () => {
    const option = progressionOption(ROWS, BUCKET.month)

    expect(option.series).toHaveLength(2)
    expect(option.series).toContainEqual(
      expect.objectContaining({ type: 'bar', name: PLAYS_SERIES, yAxisIndex: 0 }),
    )
    expect(option.series).toContainEqual(
      expect.objectContaining({ type: 'line', name: CUMULATIVE_SERIES, yAxisIndex: 1 }),
    )
  })

  it('produces an option ECharts can render without a DOM', async () => {
    const echarts = await import('echarts')
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 })
    chart.setOption(progressionOption(ROWS, BUCKET.month))

    const svg = chart.renderToSVGString()

    expect(svg).toContain('<svg')
    expect(svg).toContain(PLAYS_SERIES)
  })
})
