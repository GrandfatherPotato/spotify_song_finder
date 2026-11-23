/** One copy of each, because a caveat that disagrees between two pages is worse than none. */
import { MIN_PLAY_MS } from './duckdb/queries'

const MS_PER_SECOND = 1000

export const MIN_PLAY_SECONDS = MIN_PLAY_MS / MS_PER_SECOND

export const ALBUM_ARTIST_CAVEAT =
  'Spotify records the album artist, not the track artist, so a featured artist’s plays are credited to the primary artist.'

export const SINGLES_AS_ALBUMS_CAVEAT =
  'Spotify files singles and EPs as albums, so a one-track release can outrank a full record.'

export const LATEST_ALBUM_CAVEAT =
  'A song that appears on a reissue or compilation credits all of its plays to the most recent album it was seen on.'

export const MIN_PLAY_CAVEAT = `Plays shorter than ${MIN_PLAY_SECONDS} seconds are counted as skips, not listens, and are left out.`

export const PARTIAL_YEARS_CAVEAT =
  'The first and last years of an export are partial, so they hold less listening than a full year rather than less interest.'
