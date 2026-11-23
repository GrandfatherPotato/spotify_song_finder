// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { UNNAMED } from '../history/labels'
import { monthSpine, seriesColours, trendOption, trendSeries } from './trendOption'

const ROWS = [
  { month: '2024-01-01', id: 1, hours: 4 },
  { month: '2024-03-01', id: 1, hours: 6 },
  { month: '2024-02-01', id: 2, hours: 2 },
]

const NAMES = [
  { id: 1, label: 'Radiohead' },
  { id: 2, label: 'Bonobo' },
]

describe('monthSpine', () => {
  it('fills the months between the first and last the result mentions', () => {
    expect(monthSpine(ROWS)).toEqual(['2024-01-01', '2024-02-01', '2024-03-01'])
  })

  it('crosses a year boundary without skipping December or January', () => {
    expect(
      monthSpine([
        { month: '2023-11-01', id: 1, hours: 1 },
        { month: '2024-02-01', id: 1, hours: 1 },
      ]),
    ).toEqual(['2023-11-01', '2023-12-01', '2024-01-01', '2024-02-01'])
  })

  it('has nothing to span when there are no rows', () => {
    expect(monthSpine([])).toEqual([])
  })
})

describe('trendSeries', () => {
  it('gives a month with no plays a zero rather than letting the line skip it', () => {
    const [radiohead] = trendSeries(ROWS, NAMES)

    expect(radiohead.name).toBe('Radiohead')
    expect(radiohead.points).toEqual([
      ['2024-01-01', 4],
      ['2024-02-01', 0],
      ['2024-03-01', 6],
    ])
  })

  it('puts every series on the same months, so they can be read against each other', () => {
    const series = trendSeries(ROWS, NAMES)

    expect(series).toHaveLength(2)
    expect(series[0].points.map(([month]) => month)).toEqual(
      series[1].points.map(([month]) => month),
    )
  })

  it('draws the series in the order the table ranks them', () => {
    expect(
      trendSeries(ROWS, [
        { id: 2, label: 'Bonobo' },
        { id: 1, label: 'Radiohead' },
      ]).map((line) => line.name),
    ).toEqual(['Bonobo', 'Radiohead'])
  })

  it('draws only what was asked for, so the size control governs the chart too', () => {
    expect(trendSeries(ROWS, [{ id: 1, label: 'Radiohead' }])).toHaveLength(1)
  })

  it('keeps two entities with the same name apart rather than summing them', () => {
    const sameName = [
      { month: '2024-01-01', id: 7, hours: 3 },
      { month: '2024-01-01', id: 8, hours: 5 },
    ]

    const series = trendSeries(sameName, [
      { id: 7, label: 'Greatest Hits — A' },
      { id: 8, label: 'Greatest Hits — B' },
    ])

    expect(series.map((line) => line.points[0][1])).toEqual([3, 5])
  })

  it('labels an unnamed entity from the caller rather than inventing one', () => {
    const [series] = trendSeries(
      [{ month: '2024-01-01', id: 9, hours: 3 }],
      [{ id: 9, label: UNNAMED }],
    )

    expect(series.name).toBe(UNNAMED)
  })
})

describe('seriesColours', () => {
  it('makes as many colours as there are lines, however many that is', () => {
    expect(seriesColours(25)).toHaveLength(25)
    expect(seriesColours(0)).toEqual([])
  })

  it('gives every line its own colour', () => {
    expect(new Set(seriesColours(25)).size).toBe(25)
  })

  it('starts on the brand green, so the leader matches the rest of the page', () => {
    expect(seriesColours(1)[0]).toBe('hsl(141.0 68% 62%)')
  })

  it('keeps earlier colours stable as lines are added', () => {
    expect(seriesColours(10).slice(0, 3)).toEqual(seriesColours(3))
  })
})

describe('trendOption', () => {
  it('draws one unsmoothed line per series on a time axis', () => {
    const option = trendOption(ROWS, NAMES)

    expect(option.xAxis).toMatchObject({ type: 'time' })
    expect(option.series).toHaveLength(2)
    expect(option.series).toContainEqual(
      expect.objectContaining({ type: 'line', name: 'Bonobo', smooth: false }),
    )
  })

  it('redraws a legend toggle fast enough to read as a response rather than a hang', () => {
    const option = trendOption(ROWS, NAMES)

    expect(option.animationDuration).toBeLessThanOrEqual(500)
    expect(option.animationDurationUpdate).toBeLessThanOrEqual(500)
  })

  it('keeps animating past the 2,000-point default, where ECharts gives up silently', () => {
    expect(trendOption(ROWS, NAMES).animationThreshold).toBeGreaterThan(2000)
  })

  it('produces an option ECharts can render without a DOM', async () => {
    const echarts = await import('echarts')
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 400, height: 300 })
    chart.setOption(trendOption(ROWS, NAMES))

    const svg = chart.renderToSVGString()

    expect(svg).toContain('<svg')
    expect(svg).toContain('Radiohead')
  })
})
