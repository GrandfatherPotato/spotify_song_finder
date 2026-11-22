import { describe, expect, it } from 'vitest'
import type { HistorySummary } from './duckdb/queries'
import { yearsSpanned } from './summary'

const SUMMARY: HistorySummary = {
  plays: 222902,
  trackPlays: 220544,
  heardPlays: 180311,
  episodePlays: 2347,
  audiobookPlays: 11,
  uniqueTracks: 32017,
  uniqueArtists: 9179,
  totalHours: 9430.2,
  trackHours: 9380.1,
  firstPlay: '2018-03-05',
  lastPlay: '2026-11-14',
}

describe('yearsSpanned', () => {
  it('counts whole years between the first and last play', () => {
    expect(yearsSpanned(SUMMARY)).toBe(9)
  })

  it('never reports less than a year, so the sentence still reads', () => {
    expect(yearsSpanned({ ...SUMMARY, firstPlay: '2026-01-01', lastPlay: '2026-03-01' })).toBe(1)
  })

  it('returns zero when there are no dates to measure', () => {
    expect(yearsSpanned({ ...SUMMARY, firstPlay: '', lastPlay: '' })).toBe(0)
  })
})
