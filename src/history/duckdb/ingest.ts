/**
 * Turns built tables into the registered-file + INSERT pairs the import uses.
 *
 * Kept free of any DuckDB import so one definition of how rows are typed and
 * cast on the way in serves whichever bindings load it.
 */
import type { HistoryTables } from '../export/tables.ts'

const COLUMNS = {
  artists: { artist_id: 'INTEGER', name: 'VARCHAR' },
  albums: { album_id: 'INTEGER', name: 'VARCHAR', artist_id: 'INTEGER' },
  tracks: {
    track_id: 'INTEGER',
    uri: 'VARCHAR',
    name: 'VARCHAR',
    artist_id: 'INTEGER',
    album_id: 'INTEGER',
  },
  shows: { show_id: 'INTEGER', name: 'VARCHAR' },
  episodes: { episode_id: 'INTEGER', uri: 'VARCHAR', name: 'VARCHAR', show_id: 'INTEGER' },
  plays: {
    ts: 'VARCHAR',
    ms_played: 'INTEGER',
    kind: 'VARCHAR',
    track_id: 'INTEGER',
    episode_id: 'INTEGER',
    artist_id: 'INTEGER',
    shuffle: 'BOOLEAN',
    skipped: 'BOOLEAN',
    offline: 'BOOLEAN',
    incognito: 'BOOLEAN',
    reason_start: 'VARCHAR',
    reason_end: 'VARCHAR',
    conn_country: 'VARCHAR',
    platform: 'VARCHAR',
  },
} as const

// `ts` arrives as an ISO string and `kind` as text; both are cast here rather
// than inferred, so a sample that happens to miss a column cannot mistype it.
const PLAY_SELECT = `
  strptime(ts, '%Y-%m-%dT%H:%M:%SZ'), ms_played, CAST(kind AS play_kind),
  track_id, episode_id, artist_id, shuffle, skipped, offline, incognito,
  reason_start, reason_end, conn_country, platform
`

export interface TableLoad {
  table: string
  file: string
  rows: object[]
  insertSql: string
}

export function toNdjson(rows: object[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n')
}

function tableLoad(
  table: string,
  columns: Record<string, string>,
  rows: object[],
  select = Object.keys(columns).join(', '),
): TableLoad {
  const file = `${table}.ndjson`
  const spec = Object.entries(columns)
    .map(([name, type]) => `${name}: '${type}'`)
    .join(', ')
  const source = `read_json('${file}', format = 'newline_delimited', columns = {${spec}})`
  return { table, file, rows, insertSql: `INSERT INTO ${table} SELECT ${select} FROM ${source}` }
}

export function tableLoads(tables: HistoryTables): TableLoad[] {
  return [
    tableLoad('artists', COLUMNS.artists, tables.artists),
    tableLoad('albums', COLUMNS.albums, tables.albums),
    tableLoad('tracks', COLUMNS.tracks, tables.tracks),
    tableLoad('shows', COLUMNS.shows, tables.shows),
    tableLoad('episodes', COLUMNS.episodes, tables.episodes),
    tableLoad('plays', COLUMNS.plays, tables.plays, PLAY_SELECT),
  ].filter((load) => load.rows.length > 0)
}

export interface ImportCounts {
  malformed: number
  renamedTracks: number
  reattributedTracks: number
}

export function metaInsertSql(
  schemaVersion: number,
  sourceFiles: string[],
  counts: ImportCounts,
): string {
  const sources = sourceFiles.map((file) => `'${file.replaceAll("'", "''")}'`).join(', ')
  return (
    `INSERT INTO meta VALUES (${schemaVersion}, CAST(now() AS TIMESTAMP), [${sources}], ` +
    `${counts.malformed}, ${counts.renamedTracks}, ${counts.reattributedTracks})`
  )
}

export function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
}
