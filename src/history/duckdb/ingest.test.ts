import { describe, expect, it } from 'vitest'
import { metaInsertSql, splitStatements, tableLoads, toNdjson } from './ingest'
import type { HistoryTables } from '../export/tables'

const EMPTY_TABLES: HistoryTables = {
  artists: [],
  albums: [],
  tracks: [],
  shows: [],
  episodes: [],
  plays: [],
  malformed: 0,
  renamedTracks: 0,
  reattributedTracks: 0,
}

function tablesWith(overrides: Partial<HistoryTables>): HistoryTables {
  return { ...EMPTY_TABLES, ...overrides }
}

describe('toNdjson', () => {
  it('writes one object per line with no trailing newline', () => {
    expect(toNdjson([{ a: 1 }, { a: 2 }])).toBe('{"a":1}\n{"a":2}')
  })

  it('returns an empty string for no rows', () => {
    expect(toNdjson([])).toBe('')
  })
})

describe('tableLoads', () => {
  it('produces nothing for empty tables', () => {
    expect(tableLoads(EMPTY_TABLES)).toEqual([])
  })

  it('skips tables with no rows so an empty NDJSON file is never registered', () => {
    const loads = tableLoads(
      tablesWith({ artists: [{ artist_id: 0, name: 'Sabaton' }], shows: [] }),
    )

    expect(loads.map((load) => load.table)).toEqual(['artists'])
  })

  it('inserts every dimension before the fact table that references them', () => {
    const loads = tableLoads(
      tablesWith({
        artists: [{ artist_id: 0, name: 'Sabaton' }],
        tracks: [
          { track_id: 0, uri: 'spotify:track:x', name: 'Bismarck', artist_id: 0, album_id: null },
        ],
        plays: [
          {
            ts: '2020-01-01T00:00:00Z',
            ms_played: 1,
            kind: 'track',
            track_id: 0,
            episode_id: null,
            artist_id: 0,
            shuffle: null,
            skipped: null,
            offline: null,
            incognito: null,
            reason_start: null,
            reason_end: null,
            conn_country: null,
            platform: null,
          },
        ],
      }),
    )

    expect(loads.map((load) => load.table)).toEqual(['artists', 'tracks', 'plays'])
    expect(loads.at(-1)?.table).toBe('plays')
  })

  it('casts the play timestamp and kind rather than letting them be inferred', () => {
    const loads = tableLoads(
      tablesWith({
        plays: [
          {
            ts: '2020-01-01T00:00:00Z',
            ms_played: 1,
            kind: 'track',
            track_id: null,
            episode_id: null,
            artist_id: null,
            shuffle: null,
            skipped: null,
            offline: null,
            incognito: null,
            reason_start: null,
            reason_end: null,
            conn_country: null,
            platform: null,
          },
        ],
      }),
    )

    const { insertSql } = loads[0]
    expect(insertSql).toContain("strptime(ts, '%Y-%m-%dT%H:%M:%SZ')")
    expect(insertSql).toContain('CAST(kind AS play_kind)')
    expect(insertSql).toContain("format = 'newline_delimited'")
  })

  it('declares an explicit type for every column it reads', () => {
    const loads = tableLoads(tablesWith({ artists: [{ artist_id: 0, name: 'Sabaton' }] }))

    expect(loads[0].insertSql).toContain("columns = {artist_id: 'INTEGER', name: 'VARCHAR'}")
  })
})

const NO_COUNTS = { malformed: 0, renamedTracks: 0, reattributedTracks: 0 }

describe('metaInsertSql', () => {
  it('records the schema version and source filenames', () => {
    const sql = metaInsertSql(3, ['Streaming_History_Audio_2018.json'], NO_COUNTS)

    expect(sql).toContain('INSERT INTO meta VALUES (3,')
    expect(sql).toContain("['Streaming_History_Audio_2018.json']")
  })

  it('escapes a quote in a filename instead of breaking out of the literal', () => {
    expect(metaInsertSql(1, ["O'Brien.json"], NO_COUNTS)).toContain("['O''Brien.json']")
  })

  it('keeps the counts the build produced, so they can be surfaced later', () => {
    const sql = metaInsertSql(1, ['a.json'], {
      malformed: 12,
      renamedTracks: 22,
      reattributedTracks: 3,
    })

    expect(sql).toContain('], 12, 22, 3)')
  })
})

describe('splitStatements', () => {
  it('drops blank statements left by trailing semicolons and newlines', () => {
    expect(splitStatements('SELECT 1;\n\n  SELECT 2;\n')).toEqual(['SELECT 1', 'SELECT 2'])
  })
})
