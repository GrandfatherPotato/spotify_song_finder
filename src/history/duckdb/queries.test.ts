import { describe, expect, it } from 'vitest'
import { PLAY_KIND } from '../export/tables'
import { HISTORY_QUERIES, MIN_PLAY_MS, TOTALS_QUERY } from './queries'

describe('named queries', () => {
  it('filters music statistics to track plays explicitly', () => {
    expect(HISTORY_QUERIES.topArtistsPerYear.sql).toContain(`kind = '${PLAY_KIND.track}'`)
  })

  it('applies the named minimum-play floor rather than an inline number', () => {
    expect(HISTORY_QUERIES.topArtistsPerYear.sql).toContain(`ms_played >= ${MIN_PLAY_MS}`)
  })

  it('reports total and track hours separately, because podcasts are not music', () => {
    expect(HISTORY_QUERIES.totals.sql).toContain('AS total_hours')
    expect(HISTORY_QUERIES.totals.sql).toContain('AS track_hours')
  })

  it('keeps every statistic as a single statement', () => {
    for (const { sql } of Object.values(HISTORY_QUERIES)) {
      expect(sql.split(';').filter((part) => part.trim().length > 0)).toHaveLength(1)
    }
  })
})

const TOTALS_ROW = {
  plays: 222902,
  track_plays: 220544,
  heard_plays: 180311,
  episode_plays: 2347,
  audiobook_plays: 11,
  unique_tracks: 32017,
  unique_artists: 9179,
  total_hours: 9430.2,
  track_hours: 9380.1,
  first_play: '2018-03-05',
  last_play: '2026-11-14',
}

describe('TOTALS_QUERY', () => {
  it('parses the row into camelCase fields the view can render', () => {
    expect(TOTALS_QUERY.row.parse(TOTALS_ROW)).toEqual({
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
    })
  })

  it('rejects a renamed column rather than rendering a plausible zero', () => {
    const { plays: _dropped, ...renamed } = TOTALS_ROW

    expect(() => TOTALS_QUERY.row.parse({ ...renamed, play_count: 222902 })).toThrow()
  })

  it('rejects a count that arrived as the wrong type', () => {
    expect(() => TOTALS_QUERY.row.parse({ ...TOTALS_ROW, plays: null })).toThrow()
    expect(() => TOTALS_QUERY.row.parse({ ...TOTALS_ROW, plays: 222902n })).toThrow()
  })

  it('rejects a date that came back as a number', () => {
    expect(() => TOTALS_QUERY.row.parse({ ...TOTALS_ROW, first_play: 42 })).toThrow()
  })

  it('is the query the named map exposes', () => {
    expect(HISTORY_QUERIES.totals).toBe(TOTALS_QUERY)
  })
})
