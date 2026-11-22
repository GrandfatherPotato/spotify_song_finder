/**
 * Every statistic the app can run, as named SQL. Nothing inline at call sites.
 */
import { z } from 'zod'
import { PLAY_KIND } from '../export/tables.ts'
import { defineQuery } from './query.ts'

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

/** Named, typed and validated. The console page iterates these by name. */
export const HISTORY_QUERIES = {
  totals: TOTALS_QUERY,
  topArtistsPerYear: TOP_ARTISTS_PER_YEAR_QUERY,
  integrity: INTEGRITY_QUERY,
} as const

/** Names of every check in the integrity report that came back non-zero. */
export function integrityFailures(report: IntegrityReport): string[] {
  return Object.entries(report)
    .filter(([, count]) => count !== 0)
    .map(([check]) => check)
}
