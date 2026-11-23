/**
 * Every statistic the app can run, as named SQL. Nothing inline at call sites.
 */
import { z } from 'zod'
import { PLAY_KIND } from '../export/tables.ts'
import type { AlbumRef, ArtistRef, ItemRef } from '../itemRef.ts'
import { BUCKET } from '../range.ts'
import type { Bucket, TimeRange } from '../range.ts'
import { composeWhere, defineQuery } from './query.ts'
import type { NamedQuery, SqlFilter } from './query.ts'

/**
 * A play shorter than this is a skip, not a listen. Spotify's own royalty
 * threshold; applied to every "top" statistic so they stay comparable.
 */
export const MIN_PLAY_MS = 30_000

const TOTALS_SQL = `
    SELECT
      count(*)                                                        AS plays,
      count(*) FILTER (WHERE kind = '${PLAY_KIND.track}')             AS track_plays,
      count(*) FILTER (WHERE kind = '${PLAY_KIND.track}'
            AND ms_played >= ${MIN_PLAY_MS})                          AS heard_plays,
      count(*) FILTER (WHERE kind = '${PLAY_KIND.episode}')           AS episode_plays,
      count(*) FILTER (WHERE kind = '${PLAY_KIND.audiobook}')         AS audiobook_plays,
      count(DISTINCT track_id)                                        AS unique_tracks,
      count(DISTINCT artist_id)                                       AS unique_artists,
      -- sum() and min() are NULL over no rows, and sum(…) FILTER is NULL when
      -- nothing matches. The row schema is strict, so collapse them here.
      coalesce(round(sum(ms_played) / 3600000.0, 1), 0.0)              AS total_hours,
      coalesce(round(sum(ms_played) FILTER (WHERE kind = '${PLAY_KIND.track}')
            / 3600000.0, 1), 0.0)                                     AS track_hours,
      coalesce(strftime(min(ts), '%Y-%m-%d'), '')                      AS first_play,
      coalesce(strftime(max(ts), '%Y-%m-%d'), '')                      AS last_play
    FROM plays
  `

/**
 * Counts arrive as bigint and hours as double; both normalise to number before
 * reaching here. Declared strictly so a type change fails rather than coerces.
 */
const totalsRow = z
  .object({
    plays: z.number(),
    track_plays: z.number(),
    heard_plays: z.number(),
    episode_plays: z.number(),
    audiobook_plays: z.number(),
    unique_tracks: z.number(),
    unique_artists: z.number(),
    total_hours: z.number(),
    track_hours: z.number(),
    first_play: z.string(),
    last_play: z.string(),
  })
  .transform((row) => ({
    plays: row.plays,
    trackPlays: row.track_plays,
    heardPlays: row.heard_plays,
    episodePlays: row.episode_plays,
    audiobookPlays: row.audiobook_plays,
    uniqueTracks: row.unique_tracks,
    uniqueArtists: row.unique_artists,
    totalHours: row.total_hours,
    trackHours: row.track_hours,
    firstPlay: row.first_play,
    lastPlay: row.last_play,
  }))

export const TOTALS_QUERY = defineQuery(TOTALS_SQL, totalsRow)

export type HistorySummary = z.infer<typeof totalsRow>

const importQualityRow = z
  .object({
    malformed_rows: z.number(),
    renamed_tracks: z.number(),
    reattributed_tracks: z.number(),
  })
  .transform((row) => ({
    malformedRows: row.malformed_rows,
    renamedTracks: row.renamed_tracks,
    reattributedTracks: row.reattributed_tracks,
  }))

export type ImportQuality = z.infer<typeof importQualityRow>

export const IMPORT_QUALITY_QUERY = defineQuery(
  `
    SELECT malformed_rows, renamed_tracks, reattributed_tracks
    FROM meta
  `,
  importQualityRow,
)

const topArtistsPerYearRow = z.object({
  year: z.number(),
  artist: z.string(),
  hours: z.number(),
  plays: z.number(),
})

export type TopArtistYear = z.infer<typeof topArtistsPerYearRow>

export const TOP_ARTISTS_PER_YEAR_QUERY = defineQuery(
  `
    SELECT
      date_part('year', ts)                AS year,
      a.name                               AS artist,
      round(sum(ms_played) / 3600000.0, 1) AS hours,
      count(*)                             AS plays
    FROM plays p JOIN artists a USING (artist_id)
    WHERE kind = '${PLAY_KIND.track}' AND ms_played >= ${MIN_PLAY_MS}
    GROUP BY 1, 2
    QUALIFY row_number() OVER (PARTITION BY year ORDER BY sum(ms_played) DESC) <= 3
    ORDER BY year, hours DESC
  `,
  topArtistsPerYearRow,
)

/**
 * Every count must be zero; anything else means the import built a broken graph.
 * Parsed rather than read loosely so a renamed check cannot read as "no problems".
 */
const integrityRow = z
  .object({
    track_play_without_track: z.number(),
    other_play_with_track: z.number(),
    orphan_track_ref: z.number(),
    orphan_artist_ref: z.number(),
    denormalised_artist_drift: z.number(),
    duplicate_track_uri: z.number(),
  })
  .transform((row) => ({
    trackPlayWithoutTrack: row.track_play_without_track,
    otherPlayWithTrack: row.other_play_with_track,
    orphanTrackRef: row.orphan_track_ref,
    orphanArtistRef: row.orphan_artist_ref,
    denormalisedArtistDrift: row.denormalised_artist_drift,
    duplicateTrackUri: row.duplicate_track_uri,
  }))

export type IntegrityReport = z.infer<typeof integrityRow>

export const INTEGRITY_QUERY = defineQuery(
  `
    SELECT
      (SELECT count(*) FROM plays
        WHERE kind = '${PLAY_KIND.track}' AND track_id IS NULL)       AS track_play_without_track,
      (SELECT count(*) FROM plays
        WHERE kind <> '${PLAY_KIND.track}' AND track_id IS NOT NULL)  AS other_play_with_track,
      (SELECT count(*) FROM plays p LEFT JOIN tracks t USING (track_id)
        WHERE p.track_id IS NOT NULL AND t.track_id IS NULL)          AS orphan_track_ref,
      (SELECT count(*) FROM plays p LEFT JOIN artists a USING (artist_id)
        WHERE p.artist_id IS NOT NULL AND a.artist_id IS NULL)        AS orphan_artist_ref,
      (SELECT count(*) FROM plays p JOIN tracks t USING (track_id)
        WHERE p.artist_id IS DISTINCT FROM t.artist_id)               AS denormalised_artist_drift,
      (SELECT count(*) FROM (
        SELECT uri FROM tracks GROUP BY uri HAVING count(*) > 1))      AS duplicate_track_uri
  `,
  integrityRow,
)

export const LEADERBOARD_ENTITY = {
  artist: 'artist',
  song: 'song',
  album: 'album',
} as const

export type LeaderboardEntity = (typeof LEADERBOARD_ENTITY)[keyof typeof LEADERBOARD_ENTITY]

export const LEADERBOARD_SIZES = [3, 5, 10, 15, 25] as const

export type LeaderboardSize = (typeof LEADERBOARD_SIZES)[number]

export const DEFAULT_LEADERBOARD_SIZE: LeaderboardSize = 10

const MAX_LEADERBOARD_SIZE = Math.max(...LEADERBOARD_SIZES)

interface EntitySql {
  join: string
  key: string
  name: string
  subtitle: string
  uri: string
  groupBy: string
}

const ENTITY_SQL: Record<LeaderboardEntity, EntitySql> = {
  [LEADERBOARD_ENTITY.artist]: {
    join: 'JOIN artists a USING (artist_id)',
    key: 'a.artist_id',
    name: 'a.name',
    subtitle: 'CAST(NULL AS TEXT)',
    uri: 'CAST(NULL AS TEXT)',
    groupBy: 'a.artist_id, a.name',
  },
  [LEADERBOARD_ENTITY.song]: {
    join: 'JOIN tracks t USING (track_id) LEFT JOIN artists a ON a.artist_id = t.artist_id',
    key: 't.track_id',
    name: 't.name',
    subtitle: 'a.name',
    uri: 't.uri',
    groupBy: 't.track_id, t.uri, t.name, a.name',
  },
  [LEADERBOARD_ENTITY.album]: {
    join:
      'JOIN tracks t USING (track_id) JOIN albums al USING (album_id)' +
      ' LEFT JOIN artists a ON a.artist_id = al.artist_id',
    key: 'al.album_id',
    name: 'al.name',
    subtitle: 'a.name',
    uri: 'CAST(NULL AS TEXT)',
    groupBy: 'al.album_id, al.name, a.name',
  },
}

const BASE_WHERE = `p.kind = '${PLAY_KIND.track}' AND p.ms_played >= ${MIN_PLAY_MS}`

const ORDER_CHAIN = 'count(*) DESC, sum(ms_played) DESC, name ASC, entity_id ASC'

export function rangeFilters(range: TimeRange | null): SqlFilter[] {
  if (range === null) return []
  return [
    { clause: 'p.ts >= CAST(? AS TIMESTAMP)', params: [range.start] },
    { clause: 'p.ts < CAST(? AS TIMESTAMP)', params: [range.end] },
  ]
}

function scopedCte(entity: EntitySql, where: string): string {
  return `
    WITH scoped AS (
      SELECT
        ${entity.key}      AS entity_id,
        ${entity.name}     AS name,
        ${entity.subtitle} AS subtitle,
        ${entity.uri}      AS uri,
        p.ms_played,
        p.ts
      FROM plays p ${entity.join}
      WHERE ${where}
    )`
}

const leaderboardRow = z.object({
  id: z.number(),
  name: z.string().nullable(),
  subtitle: z.string().nullable(),
  uri: z.string().nullable(),
  plays: z.number(),
  hours: z.number(),
})

export type LeaderboardRow = z.infer<typeof leaderboardRow>

const trendRow = z.object({
  bucket: z.string(),
  id: z.number(),
  hours: z.number(),
})

export type TrendRow = z.infer<typeof trendRow>

export function leaderboardQuery(
  entity: LeaderboardEntity,
  range: TimeRange | null,
): NamedQuery<LeaderboardRow, readonly unknown[]> {
  const { where, params } = composeWhere(BASE_WHERE, rangeFilters(range))
  return defineQuery(
    `${scopedCte(ENTITY_SQL[entity], where)}
    SELECT
      entity_id                            AS id,
      name,
      subtitle,
      uri,
      count(*)                             AS plays,
      round(sum(ms_played) / 3600000.0, 1) AS hours
    FROM scoped
    GROUP BY entity_id, name, subtitle, uri
    ORDER BY ${ORDER_CHAIN}
    LIMIT ${MAX_LEADERBOARD_SIZE}`,
    leaderboardRow,
    params,
  )
}

export function trendQuery(
  entity: LeaderboardEntity,
  range: TimeRange | null,
  bucket: Bucket = BUCKET.month,
): NamedQuery<TrendRow, readonly unknown[]> {
  const { where, params } = composeWhere(BASE_WHERE, rangeFilters(range))
  return defineQuery(
    `${scopedCte(ENTITY_SQL[entity], where)},
    leaders AS (
      SELECT entity_id
      FROM scoped
      GROUP BY entity_id, name
      QUALIFY row_number() OVER (ORDER BY ${ORDER_CHAIN}) <= ${MAX_LEADERBOARD_SIZE}
    )
    SELECT
      strftime(date_trunc('${bucket}', ts), '%Y-%m-%d') AS bucket,
      entity_id                                        AS id,
      round(sum(ms_played) / 3600000.0, 2)             AS hours
    FROM scoped JOIN leaders USING (entity_id)
    GROUP BY 1, 2
    ORDER BY 1, 2`,
    trendRow,
    params,
  )
}

export const SEARCH_RESULT_LIMIT = 20

const searchRow = z.object({
  name: z.string().nullable(),
  subtitle: z.string().nullable(),
  uri: z.string().nullable(),
  plays: z.number(),
})

export type SearchRow = z.infer<typeof searchRow>

const itemSummaryRow = z
  .object({
    name: z.string().nullable(),
    subtitle: z.string().nullable(),
    plays: z.number(),
    hours: z.number(),
    first_play: z.string(),
    last_play: z.string(),
  })
  .transform((row) => ({
    name: row.name,
    subtitle: row.subtitle,
    plays: row.plays,
    hours: row.hours,
    firstPlay: row.first_play,
    lastPlay: row.last_play,
  }))

export type ItemSummary = z.infer<typeof itemSummaryRow>

const progressionRow = z.object({
  bucket: z.string(),
  plays: z.number(),
  hours: z.number(),
})

export type ProgressionRow = z.infer<typeof progressionRow>

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`)
}

function searchFilter(entity: EntitySql, fragment: string): SqlFilter {
  return {
    clause: `${entity.name} ILIKE ? ESCAPE '\\'`,
    params: [`%${escapeLike(fragment)}%`],
  }
}

/**
 * Matched on the natural key the URL carries, never on `entity_id`: those are
 * handed out at import and point somewhere else after the next one.
 */
function matchFilter(ref: ItemRef): SqlFilter {
  if (ref.entity === LEADERBOARD_ENTITY.song) {
    return { clause: 't.uri = ?', params: [ref.uri] }
  }
  if (ref.entity === LEADERBOARD_ENTITY.artist) {
    return { clause: 'a.name = ?', params: [ref.name] }
  }
  return {
    clause: 'al.name = ? AND a.name IS NOT DISTINCT FROM ?',
    params: [ref.name, ref.artist],
  }
}

export function searchQuery(
  entity: LeaderboardEntity,
  fragment: string,
): NamedQuery<SearchRow, readonly unknown[]> {
  const sql = ENTITY_SQL[entity]
  const { where, params } = composeWhere(BASE_WHERE, [searchFilter(sql, fragment)])
  return defineQuery(
    `
    SELECT
      ${sql.name}     AS name,
      ${sql.subtitle} AS subtitle,
      ${sql.uri}      AS uri,
      count(*)        AS plays
    FROM plays p ${sql.join}
    WHERE ${where}
    GROUP BY ${sql.groupBy}
    ORDER BY count(*) DESC, ${sql.name} ASC, ${sql.key} ASC
    LIMIT ${SEARCH_RESULT_LIMIT}`,
    searchRow,
    params,
  )
}

export function itemSummaryQuery(ref: ItemRef): NamedQuery<ItemSummary, readonly unknown[]> {
  const sql = ENTITY_SQL[ref.entity]
  const { where, params } = composeWhere(BASE_WHERE, [matchFilter(ref)])
  return defineQuery(
    `
    SELECT
      any_value(${sql.name})                              AS name,
      any_value(${sql.subtitle})                          AS subtitle,
      count(*)                                            AS plays,
      coalesce(round(sum(ms_played) / 3600000.0, 1), 0.0) AS hours,
      coalesce(strftime(min(ts), '%Y-%m-%d'), '')         AS first_play,
      coalesce(strftime(max(ts), '%Y-%m-%d'), '')         AS last_play
    FROM plays p ${sql.join}
    WHERE ${where}`,
    itemSummaryRow,
    params,
  )
}

/**
 * The artist board reaches artists through `plays.artist_id` and never joins
 * `tracks`; listing an artist's songs has to. `albums` is a LEFT JOIN so a
 * track the export never placed on one is still counted.
 */
const SONGS_JOIN: Record<ArtistRef['entity'] | AlbumRef['entity'], string> = {
  [LEADERBOARD_ENTITY.artist]:
    'JOIN tracks t USING (track_id) LEFT JOIN albums al USING (album_id)' +
    ' JOIN artists a ON a.artist_id = t.artist_id',
  [LEADERBOARD_ENTITY.album]: ENTITY_SQL[LEADERBOARD_ENTITY.album].join,
}

/** Shaped as a leaderboard row so the ranked table renders it unchanged. The
    album rides along as `subtitle`, which is also what groups the list. */
export function itemSongsQuery(
  ref: ArtistRef | AlbumRef,
  range: TimeRange | null,
): NamedQuery<LeaderboardRow, readonly unknown[]> {
  const { where, params } = composeWhere(BASE_WHERE, [matchFilter(ref), ...rangeFilters(range)])
  return defineQuery(
    `
    SELECT
      t.track_id                             AS id,
      t.name                                 AS name,
      al.name                                AS subtitle,
      t.uri                                  AS uri,
      count(*)                               AS plays,
      round(sum(p.ms_played) / 3600000.0, 1) AS hours
    FROM plays p ${SONGS_JOIN[ref.entity]}
    WHERE ${where}
    GROUP BY t.track_id, t.name, al.name, t.uri
    ORDER BY count(*) DESC, sum(p.ms_played) DESC, t.name ASC, t.track_id ASC`,
    leaderboardRow,
    params,
  )
}

export function progressionQuery(
  ref: ItemRef,
  range: TimeRange | null,
  bucket: Bucket,
): NamedQuery<ProgressionRow, readonly unknown[]> {
  const sql = ENTITY_SQL[ref.entity]
  const { where, params } = composeWhere(BASE_WHERE, [matchFilter(ref), ...rangeFilters(range)])
  return defineQuery(
    `
    SELECT
      strftime(date_trunc('${bucket}', p.ts), '%Y-%m-%d') AS bucket,
      count(*)                                           AS plays,
      round(sum(p.ms_played) / 3600000.0, 2)             AS hours
    FROM plays p ${sql.join}
    WHERE ${where}
    GROUP BY 1
    ORDER BY 1`,
    progressionRow,
    params,
  )
}

/** Named, typed and validated. The console page iterates these by name. */
export const HISTORY_QUERIES = {
  totals: TOTALS_QUERY,
  topArtistsPerYear: TOP_ARTISTS_PER_YEAR_QUERY,
  integrity: INTEGRITY_QUERY,
  topArtists: leaderboardQuery(LEADERBOARD_ENTITY.artist, null),
  topSongs: leaderboardQuery(LEADERBOARD_ENTITY.song, null),
  topAlbums: leaderboardQuery(LEADERBOARD_ENTITY.album, null),
  artistTrend: trendQuery(LEADERBOARD_ENTITY.artist, null),
  songTrend: trendQuery(LEADERBOARD_ENTITY.song, null),
  albumTrend: trendQuery(LEADERBOARD_ENTITY.album, null),
} as const

/** Names of every check in the integrity report that came back non-zero. */
export function integrityFailures(report: IntegrityReport): string[] {
  return Object.entries(report)
    .filter(([, count]) => count !== 0)
    .map(([check]) => check)
}
