import { describe, expect, it } from 'vitest'
import { PLAY_KIND } from '../export/tables'
import type { ItemRef } from '../itemRef'
import { BUCKET, yearRange } from '../range'
import {
  HISTORY_QUERIES,
  LEADERBOARD_ENTITY,
  LEADERBOARD_SIZES,
  MIN_PLAY_MS,
  TOTALS_QUERY,
  itemSongsQuery,
  itemSummaryQuery,
  leaderboardQuery,
  progressionQuery,
  searchQuery,
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

describe('searchQuery', () => {
  it('binds the fragment rather than pasting it into the statement', () => {
    const query = searchQuery(LEADERBOARD_ENTITY.artist, 'radio')

    expect(query.sql).not.toContain('radio')
    expect(query.defaultParams).toEqual(['%radio%'])
  })

  it('escapes wildcards, so a literal percent does not match everything', () => {
    expect(searchQuery(LEADERBOARD_ENTITY.song, '50%').defaultParams).toEqual(['%50\\%%'])
    expect(searchQuery(LEADERBOARD_ENTITY.song, 'a_b').defaultParams).toEqual(['%a\\_b%'])
  })

  it('returns the stable URI for songs and nothing for the rest', () => {
    expect(flat(searchQuery(LEADERBOARD_ENTITY.song, 'x').sql)).toContain('t.uri AS uri')
    expect(flat(searchQuery(LEADERBOARD_ENTITY.artist, 'x').sql)).toContain(
      'CAST(NULL AS TEXT) AS uri',
    )
  })

  it('keeps the floor and the track filter that every other statistic uses', () => {
    for (const entity of ENTITIES) {
      const { sql } = searchQuery(entity, 'x')

      expect(sql).toContain(`p.kind = '${PLAY_KIND.track}'`)
      expect(sql).toContain(`p.ms_played >= ${MIN_PLAY_MS}`)
    }
  })
})

describe('itemSummaryQuery and progressionQuery', () => {
  const ARTIST: ItemRef = { entity: LEADERBOARD_ENTITY.artist, name: 'Radiohead' }
  const SONG: ItemRef = { entity: LEADERBOARD_ENTITY.song, uri: 'spotify:track:abc' }
  const ALBUM: ItemRef = { entity: LEADERBOARD_ENTITY.album, name: 'Kid A', artist: 'Radiohead' }

  it('matches a song on its URI and never on its name', () => {
    const query = itemSummaryQuery(SONG)

    expect(query.sql).toContain('t.uri = ?')
    expect(query.defaultParams).toEqual(['spotify:track:abc'])
  })

  it('matches an artist on the only identity the export gives it', () => {
    expect(itemSummaryQuery(ARTIST).defaultParams).toEqual(['Radiohead'])
  })

  it('matches an album on name and artist together, since names repeat', () => {
    const query = itemSummaryQuery(ALBUM)

    expect(query.sql).toContain('al.name = ? AND a.name IS NOT DISTINCT FROM ?')
    expect(query.defaultParams).toEqual(['Kid A', 'Radiohead'])
  })

  it('finds an album whose artist the export never named', () => {
    const ref: ItemRef = { entity: LEADERBOARD_ENTITY.album, name: 'Untitled', artist: null }

    expect(itemSummaryQuery(ref).defaultParams).toEqual(['Untitled', null])
  })

  it('binds the match before the range, in the order the clauses are written', () => {
    const query = progressionQuery(ALBUM, yearRange(2024), BUCKET.week)

    expect(query.defaultParams).toEqual(['Kid A', 'Radiohead', '2024-01-01', '2025-01-01'])
  })

  it('binds every placeholder it writes, at every bucket and range', () => {
    for (const ref of [ARTIST, SONG, ALBUM]) {
      for (const range of [null, yearRange(2024)]) {
        for (const bucket of Object.values(BUCKET)) {
          const query = progressionQuery(ref, range, bucket)

          expect(placeholderCount(query.sql)).toBe(query.defaultParams?.length)
        }
      }
    }
  })

  it('buckets at the granularity it was asked for', () => {
    expect(progressionQuery(ARTIST, null, BUCKET.day).sql).toContain("date_trunc('day'")
    expect(progressionQuery(ARTIST, null, BUCKET.week).sql).toContain("date_trunc('week'")
  })

  it('collapses the empty-result nulls so the row schema still parses', () => {
    const { sql } = itemSummaryQuery(ARTIST)

    expect(sql).toContain('coalesce(round(sum(ms_played)')
    expect(sql).toContain("coalesce(strftime(min(ts), '%Y-%m-%d'), '')")
  })
})

describe('itemSongsQuery', () => {
  const ARTIST: ItemRef = { entity: LEADERBOARD_ENTITY.artist, name: 'Radiohead' }
  const ALBUM: ItemRef = { entity: LEADERBOARD_ENTITY.album, name: 'Kid A', artist: 'Radiohead' }

  it('joins tracks for an artist, which the artist board never does', () => {
    const { sql } = itemSongsQuery(ARTIST, null)

    expect(flat(sql)).toContain('JOIN tracks t USING (track_id)')
    expect(flat(sql)).toContain('a.artist_id = t.artist_id')
  })

  it('groups by the track key so a renamed song stays one row', () => {
    expect(flat(itemSongsQuery(ALBUM, null).sql)).toContain(
      'GROUP BY t.track_id, t.name, al.name, t.uri',
    )
  })

  it('carries the album as the subtitle, left joined so an album-less track survives', () => {
    const { sql } = itemSongsQuery(ARTIST, null)

    expect(flat(sql)).toContain('al.name AS subtitle')
    expect(flat(sql)).toContain('LEFT JOIN albums al USING (album_id)')
  })

  it('comes back shaped as a leaderboard row, so the ranked table renders it', () => {
    const { sql, row } = itemSongsQuery(ARTIST, null)

    expect(flat(sql)).toContain('t.track_id AS id')
    expect(flat(sql)).toContain('t.uri AS uri')
    expect(row).toBe(leaderboardQuery(LEADERBOARD_ENTITY.artist, null).row)
  })

  it('narrows to the range, binding the match first', () => {
    const query = itemSongsQuery(ALBUM, yearRange(2024))

    expect(query.defaultParams).toEqual(['Kid A', 'Radiohead', '2024-01-01', '2025-01-01'])
    expect(placeholderCount(query.sql)).toBe(query.defaultParams?.length)
  })

  it('keeps the floor and the track filter', () => {
    const { sql } = itemSongsQuery(ARTIST, null)

    expect(sql).toContain(`p.kind = '${PLAY_KIND.track}'`)
    expect(sql).toContain(`p.ms_played >= ${MIN_PLAY_MS}`)
  })
})

describe('leaderboard rows', () => {
  const ROW = { id: 4, name: 'Radiohead', subtitle: null, uri: null, plays: 1284, hours: 87.2 }
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
