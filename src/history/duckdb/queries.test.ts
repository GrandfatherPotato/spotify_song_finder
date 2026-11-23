import { describe, expect, it } from 'vitest'
import { PLAY_KIND } from '../export/tables'
import { yearRange } from '../range'
import {
  HISTORY_QUERIES,
  LEADERBOARD_ENTITY,
  LEADERBOARD_SIZES,
  MIN_PLAY_MS,
  TOTALS_QUERY,
  leaderboardQuery,
  trendQuery,
} from './queries'

const ENTITIES = Object.values(LEADERBOARD_ENTITY)

function flat(sql: string): string {
  return sql.replace(/\s+/gu, ' ').trim()
}

function placeholderCount(sql: string): number {
  return (sql.match(/\?/gu) ?? []).length
}

const KEY_COLUMN = {
  [LEADERBOARD_ENTITY.artist]: 'a.artist_id AS entity_id',
  [LEADERBOARD_ENTITY.song]: 't.track_id AS entity_id',
  [LEADERBOARD_ENTITY.album]: 'al.album_id AS entity_id',
}

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

describe('leaderboard and trend queries', () => {
  it('filters to track plays and applies the named floor, for every entity', () => {
    for (const entity of ENTITIES) {
      for (const { sql } of [leaderboardQuery(entity, null), trendQuery(entity, null)]) {
        expect(sql).toContain(`p.kind = '${PLAY_KIND.track}'`)
        expect(sql).toContain(`p.ms_played >= ${MIN_PLAY_MS}`)
      }
    }
  })

  it('groups on the key column, never on the display name', () => {
    for (const entity of ENTITIES) {
      expect(flat(leaderboardQuery(entity, null).sql)).toContain(KEY_COLUMN[entity])
    }
  })

  it('binds every placeholder it writes, so no argument can shift onto another', () => {
    for (const entity of ENTITIES) {
      for (const range of [null, yearRange(2024)]) {
        for (const query of [leaderboardQuery(entity, range), trendQuery(entity, range)]) {
          expect(placeholderCount(query.sql)).toBe(query.defaultParams?.length)
        }
      }
    }
  })

  it('writes no range predicate at all for all time', () => {
    for (const entity of ENTITIES) {
      const query = leaderboardQuery(entity, null)

      expect(query.sql).not.toContain('CAST(? AS TIMESTAMP)')
      expect(query.defaultParams).toEqual([])
    }
  })

  it('binds a half-open range once, even though the trend reads it twice', () => {
    const range = yearRange(2024)

    expect(flat(leaderboardQuery(LEADERBOARD_ENTITY.artist, range).sql)).toContain(
      'p.ts >= CAST(? AS TIMESTAMP) AND p.ts < CAST(? AS TIMESTAMP)',
    )
    expect(trendQuery(LEADERBOARD_ENTITY.artist, range).defaultParams).toEqual([
      '2024-01-01',
      '2025-01-01',
    ])
  })

  it('takes the top 25 so the size control can slice rather than re-query', () => {
    expect(leaderboardQuery(LEADERBOARD_ENTITY.artist, null).sql).toContain(
      `LIMIT ${Math.max(...LEADERBOARD_SIZES)}`,
    )
  })

  it('picks the chart series with the same ordering the table ranks by', () => {
    for (const entity of ENTITIES) {
      const ranked = /ORDER BY (.+?) LIMIT/u.exec(flat(leaderboardQuery(entity, null).sql))?.[1]
      const charted = /row_number\(\) OVER \(ORDER BY (.+?)\) <=/u.exec(
        flat(trendQuery(entity, null).sql),
      )?.[1]

      expect(ranked).toBeDefined()
      expect(charted).toBe(ranked)
    }
  })

  it('offers the trend as many series as the largest board, so the size control governs both', () => {
    expect(trendQuery(LEADERBOARD_ENTITY.artist, null).sql).toContain(
      `<= ${Math.max(...LEADERBOARD_SIZES)}`,
    )
  })

  it('gives the artist board a typed null subtitle rather than a bare NULL', () => {
    expect(flat(leaderboardQuery(LEADERBOARD_ENTITY.artist, null).sql)).toContain(
      'CAST(NULL AS TEXT) AS subtitle',
    )
  })

  it('buckets the trend by month as a date the time axis can parse', () => {
    expect(trendQuery(LEADERBOARD_ENTITY.artist, null).sql).toContain(
      "strftime(date_trunc('month', ts), '%Y-%m-%d')",
    )
  })
})

describe('leaderboard rows', () => {
  const ROW = { id: 4, name: 'Radiohead', subtitle: null, plays: 1284, hours: 87.2 }
  const { row } = leaderboardQuery(LEADERBOARD_ENTITY.artist, null)

  it('parses a row the database really returns', () => {
    expect(row.parse(ROW)).toEqual(ROW)
  })

  it('accepts an unnamed track, which a real export contains', () => {
    expect(row.parse({ ...ROW, name: null })).toEqual({ ...ROW, name: null })
  })

  it('rejects a renamed column rather than rendering a plausible zero', () => {
    const { plays: _dropped, ...renamed } = ROW

    expect(() => row.parse({ ...renamed, play_count: 1284 })).toThrow()
  })

  it('rejects a count that arrived as the wrong type', () => {
    expect(() => row.parse({ ...ROW, plays: 1284n })).toThrow()
    expect(() => row.parse({ ...ROW, plays: null })).toThrow()
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
