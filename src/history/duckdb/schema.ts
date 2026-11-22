/**
 * DDL for the streaming-history star schema. Statistics live in queries.ts.
 */
import { PLAY_KIND } from '../export/tables.ts'

export const HISTORY_SCHEMA_VERSION = 2

/** Every table rebuilt by an import, in dependency order. Excludes enrichment. */
export const HISTORY_TABLES = [
  'artists',
  'albums',
  'tracks',
  'shows',
  'episodes',
  'plays',
  'meta',
] as const

const PLAY_KIND_VALUES = Object.values(PLAY_KIND)
  .map((kind) => `'${kind}'`)
  .join(', ')

/**
 * A Spotify export is a full cumulative snapshot, so re-importing rebuilds
 * everything — except `artist_enrichment`, which is fetched, not exported, and
 * would be destroyed by a rebuild.
 */
export const HISTORY_RESET_SQL = `
DROP TABLE IF EXISTS meta;
DROP TABLE IF EXISTS plays;
DROP TABLE IF EXISTS episodes;
DROP TABLE IF EXISTS shows;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS albums;
DROP TABLE IF EXISTS artists;
DROP TYPE IF EXISTS play_kind;
`

export const HISTORY_SCHEMA_SQL = `
CREATE TYPE play_kind AS ENUM (${PLAY_KIND_VALUES});

CREATE TABLE artists  (artist_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE albums   (album_id  INTEGER PRIMARY KEY, name TEXT, artist_id INTEGER);
CREATE TABLE tracks   (track_id  INTEGER PRIMARY KEY, uri TEXT UNIQUE,
                       name TEXT, artist_id INTEGER, album_id INTEGER);
CREATE TABLE shows    (show_id    INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE episodes (episode_id INTEGER PRIMARY KEY, uri TEXT UNIQUE,
                       name TEXT, show_id INTEGER);

CREATE TABLE plays (
  ts           TIMESTAMP NOT NULL,
  ms_played    INTEGER   NOT NULL,
  kind         play_kind NOT NULL,
  track_id     INTEGER,
  episode_id   INTEGER,
  artist_id    INTEGER,
  shuffle      BOOLEAN, skipped BOOLEAN, offline BOOLEAN, incognito BOOLEAN,
  reason_start TEXT, reason_end TEXT, conn_country TEXT, platform TEXT
);

CREATE TABLE IF NOT EXISTS artist_enrichment (
  artist_name TEXT PRIMARY KEY,
  spotify_id TEXT, image_url TEXT, genres TEXT[], lastfm_tags TEXT[],
  fetched_at TIMESTAMP
);

CREATE TABLE meta (
  schema_version      INTEGER   NOT NULL,
  imported_at         TIMESTAMP NOT NULL,
  source_files        TEXT[]    NOT NULL,
  -- Counted during the build and kept, not discarded: rows the export could
  -- not place, and tracks Spotify relabelled or reattributed mid-history.
  malformed_rows      INTEGER   NOT NULL,
  renamed_tracks      INTEGER   NOT NULL,
  reattributed_tracks INTEGER   NOT NULL
);
`
