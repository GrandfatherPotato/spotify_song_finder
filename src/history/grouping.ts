import type { LeaderboardRow } from './duckdb/queries'
import { UNNAMED } from './labels'

export interface AlbumGroup {
  album: string
  plays: number
  hours: number
  songs: LeaderboardRow[]
}

const HOURS_PRECISION = 10

/**
 * Albums by how much of each was played, songs within them left in the order
 * the query ranked them. The album is the row's `subtitle`.
 */
export function groupSongsByAlbum(songs: readonly LeaderboardRow[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>()
  for (const song of songs) {
    const album = song.subtitle ?? UNNAMED
    const group = groups.get(album) ?? { album, plays: 0, hours: 0, songs: [] }
    group.plays += song.plays
    group.hours = Math.round((group.hours + song.hours) * HOURS_PRECISION) / HOURS_PRECISION
    group.songs.push(song)
    groups.set(album, group)
  }
  return [...groups.values()].sort(
    (one, other) => other.plays - one.plays || one.album.localeCompare(other.album),
  )
}
