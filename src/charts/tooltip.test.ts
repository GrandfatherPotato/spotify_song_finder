// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { BUCKET } from '../history/range'
import { bucketLabel, escapeHtml, tooltipFormatter } from './tooltip'

function point(seriesName: string, date: string, value: number) {
  return { seriesName, marker: '<span></span>', value: [date, value] }
}

describe('bucketLabel', () => {
  it('names the day for daily buckets', () => {
    expect(bucketLabel('2024-03-05', BUCKET.day)).toBe('5 March 2024')
  })

  it('says a weekly bucket is a week, not just its first day', () => {
    expect(bucketLabel('2024-03-04', BUCKET.week)).toBe('Week of 4 March 2024')
  })

  it('drops the day for monthly buckets, which do not have one', () => {
    expect(bucketLabel('2024-03-01', BUCKET.month)).toBe('March 2024')
  })

  it('reads the date in UTC rather than the browser timezone', () => {
    expect(bucketLabel('2024-01-01', BUCKET.day)).toBe('1 January 2024')
  })

  it('shows the raw value rather than inventing a date it cannot read', () => {
    expect(bucketLabel('not-a-date', BUCKET.day)).toBe('not-a-date')
  })
})

describe('tooltipFormatter', () => {
  const format = tooltipFormatter(BUCKET.day, (value, series) => `${value} ${series}`)

  it('heads the tooltip with the period the point covers', () => {
    expect(format([point('Plays', '2024-03-05', 12)])).toContain('5 March 2024')
  })

  it('lists every series at that point with its own value', () => {
    const html = format([
      point('Plays', '2024-03-05', 12),
      point('Total to date', '2024-03-05', 99),
    ])

    expect(html).toContain('12 Plays')
    expect(html).toContain('99 Total to date')
  })

  it('escapes a series name, since ECharts renders the tooltip as HTML', () => {
    const html = format([point('<img src=x onerror=alert(1)>', '2024-03-05', 1)])

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it("keeps the marker swatch, which is ECharts' own markup", () => {
    expect(format([point('Plays', '2024-03-05', 12)])).toContain('<span></span>')
  })

  it('survives params that are not the shape it expects', () => {
    expect(format(undefined)).toBe('')
    expect(format([{ seriesName: 'Plays' }])).toBe('')
  })
})

describe('escapeHtml', () => {
  it('escapes every character that could close or open a tag', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('leaves an ordinary track name alone', () => {
    expect(escapeHtml('No Surprises')).toBe('No Surprises')
  })
})
