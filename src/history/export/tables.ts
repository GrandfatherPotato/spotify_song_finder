/**
 * Dictionary-encodes a parsed Extended Streaming History export into the star
 * schema in `docs/streaming-history-context.md`.
 */

export const PLAY_KIND = {
  track: 'track',
  episode: 'episode',
  audiobook: 'audiobook',
} as const

export type PlayKind = (typeof PLAY_KIND)[keyof typeof PLAY_KIND]

// Album names are not unique across artists, so the dictionary key is the pair.
const ALBUM_KEY_SEPARATOR = '\0'

/** Shape of one row in `Streaming_History_*.json`, derived from a real 2018-2026 export. */
export interface StreamingHistoryEntry {
  ts: string
  platform: string | null
  ms_played: number
  conn_country: string | null
  // Present in every row and deliberately never copied into a table - see
  // `docs/streaming-history-context.md`, "Privacy".
  ip_addr: string | null
  master_metadata_track_name: string | null
  master_metadata_album_artist_name: string | null
  master_metadata_album_album_name: string | null
  spotify_track_uri: string | null
  episode_name: string | null
  episode_show_name: string | null
  spotify_episode_uri: string | null
  audiobook_title: string | null
  audiobook_uri: string | null
  audiobook_chapter_uri: string | null
  audiobook_chapter_title: string | null
  reason_start: string | null
  reason_end: string | null
  shuffle: boolean | null
  skipped: boolean | null
  offline: boolean | null
  offline_timestamp: number | null
  incognito_mode: boolean | null
}

export interface ArtistRow {
  artist_id: number
  name: string
}

export interface AlbumRow {
  album_id: number
  name: string
  artist_id: number | null
}

export interface TrackRow {
  track_id: number
  uri: string
  name: string | null
  artist_id: number | null
  album_id: number | null
}

export interface ShowRow {
  show_id: number
  name: string
}

export interface EpisodeRow {
  episode_id: number
  uri: string
  name: string | null
  show_id: number | null
}

export interface PlayRow {
  ts: string
  ms_played: number
  kind: PlayKind
  track_id: number | null
  episode_id: number | null
  artist_id: number | null
  shuffle: boolean | null
  skipped: boolean | null
  offline: boolean | null
  incognito: boolean | null
  reason_start: string | null
  reason_end: string | null
  conn_country: string | null
  platform: string | null
}

export interface HistoryTables {
  artists: ArtistRow[]
  albums: AlbumRow[]
  tracks: TrackRow[]
  shows: ShowRow[]
  episodes: EpisodeRow[]
  plays: PlayRow[]
  malformed: number
  renamedTracks: number
  reattributedTracks: number
}

interface ClassifiedPlay {
  kind: PlayKind
  uri: string
}

type PlayReferences = Pick<PlayRow, 'track_id' | 'episode_id' | 'artist_id'>

/**
 * Entries are parsed from a file the user supplies, so a field may be absent
 * rather than null. Testing for null alone would class such a row as a track
 * play keyed on `undefined`, inventing one phantom track that swallows them all.
 */
function isUri(value: string | null | undefined): value is string {
  return typeof value === 'string' && value !== ''
}

export function classifyPlay(entry: StreamingHistoryEntry): ClassifiedPlay | null {
  const { spotify_track_uri, spotify_episode_uri, audiobook_uri } = entry
  if (isUri(spotify_track_uri)) return { kind: PLAY_KIND.track, uri: spotify_track_uri }
  if (isUri(spotify_episode_uri)) return { kind: PLAY_KIND.episode, uri: spotify_episode_uri }
  if (isUri(audiobook_uri)) return { kind: PLAY_KIND.audiobook, uri: audiobook_uri }
  return null
}

export class HistoryTableBuilder {
  #artists: ArtistRow[] = []
  #albums: AlbumRow[] = []
  #tracks: TrackRow[] = []
  #shows: ShowRow[] = []
  #episodes: EpisodeRow[] = []
  #plays: PlayRow[] = []
  #malformed = 0

  #artistIds = new Map<string, number>()
  #albumIds = new Map<string, number>()
  #trackIds = new Map<string, number>()
  #showIds = new Map<string, number>()
  #episodeIds = new Map<string, number>()
  #trackSeenAt: string[] = []
  #episodeSeenAt: string[] = []
  #renamedTrackIds = new Set<number>()
  #reattributedTrackIds = new Set<number>()

  addFile(entries: StreamingHistoryEntry[]): void {
    for (const entry of entries) this.#addEntry(entry)
  }

  /**
   * `plays.artist_id` is backfilled from the track's canonical artist here, not
   * written at parse time: a track reattributed mid-history would otherwise
   * carry two different artist keys and split its own totals.
   */
  finish(): HistoryTables {
    for (const play of this.#plays) {
      if (play.track_id === null) continue
      play.artist_id = this.#tracks[play.track_id].artist_id
    }
    return {
      artists: this.#artists,
      albums: this.#albums,
      tracks: this.#tracks,
      shows: this.#shows,
      episodes: this.#episodes,
      plays: this.#plays,
      malformed: this.#malformed,
      renamedTracks: this.#renamedTrackIds.size,
      reattributedTracks: this.#reattributedTrackIds.size,
    }
  }

  #addEntry(entry: StreamingHistoryEntry): void {
    const play = classifyPlay(entry)
    if (play === null) {
      this.#malformed += 1
      return
    }
    this.#plays.push({
      ts: entry.ts,
      ms_played: entry.ms_played,
      kind: play.kind,
      ...this.#resolveReferences(entry, play),
      shuffle: entry.shuffle,
      skipped: entry.skipped,
      offline: entry.offline,
      incognito: entry.incognito_mode,
      reason_start: entry.reason_start,
      reason_end: entry.reason_end,
      conn_country: entry.conn_country,
      platform: entry.platform,
    })
  }

  #resolveReferences(entry: StreamingHistoryEntry, play: ClassifiedPlay): PlayReferences {
    if (play.kind === PLAY_KIND.track) {
      const artistId = this.#internArtist(entry.master_metadata_album_artist_name)
      const albumId = this.#internAlbum(entry.master_metadata_album_album_name, artistId)
      const trackId = this.#internTrack(entry, play.uri, artistId, albumId)
      return { track_id: trackId, episode_id: null, artist_id: artistId }
    }
    if (play.kind === PLAY_KIND.episode) {
      return { track_id: null, episode_id: this.#internEpisode(entry, play.uri), artist_id: null }
    }
    return { track_id: null, episode_id: null, artist_id: null }
  }

  #internArtist(name: string | null): number | null {
    if (name === null) return null
    const existing = this.#artistIds.get(name)
    if (existing !== undefined) return existing
    const artistId = this.#artists.length
    this.#artistIds.set(name, artistId)
    this.#artists.push({ artist_id: artistId, name })
    return artistId
  }

  #internAlbum(name: string | null, artistId: number | null): number | null {
    if (name === null) return null
    const key = `${artistId}${ALBUM_KEY_SEPARATOR}${name}`
    const existing = this.#albumIds.get(key)
    if (existing !== undefined) return existing
    const albumId = this.#albums.length
    this.#albumIds.set(key, albumId)
    this.#albums.push({ album_id: albumId, name, artist_id: artistId })
    return albumId
  }

  #internShow(name: string | null): number | null {
    if (name === null) return null
    const existing = this.#showIds.get(name)
    if (existing !== undefined) return existing
    const showId = this.#shows.length
    this.#showIds.set(name, showId)
    this.#shows.push({ show_id: showId, name })
    return showId
  }

  #internTrack(
    entry: StreamingHistoryEntry,
    uri: string,
    artistId: number | null,
    albumId: number | null,
  ): number {
    const existing = this.#trackIds.get(uri)
    if (existing === undefined) return this.#createTrack(entry, uri, artistId, albumId)
    this.#updateTrack(existing, entry, artistId, albumId)
    return existing
  }

  #createTrack(
    entry: StreamingHistoryEntry,
    uri: string,
    artistId: number | null,
    albumId: number | null,
  ): number {
    const trackId = this.#tracks.length
    this.#trackIds.set(uri, trackId)
    this.#tracks.push({
      track_id: trackId,
      uri,
      name: entry.master_metadata_track_name,
      artist_id: artistId,
      album_id: albumId,
    })
    this.#trackSeenAt.push(entry.ts)
    return trackId
  }

  #updateTrack(
    trackId: number,
    entry: StreamingHistoryEntry,
    artistId: number | null,
    albumId: number | null,
  ): void {
    const row = this.#tracks[trackId]
    if (row.name !== entry.master_metadata_track_name) this.#renamedTrackIds.add(trackId)
    if (row.artist_id !== artistId) this.#reattributedTrackIds.add(trackId)
    if (entry.ts <= this.#trackSeenAt[trackId]) return
    this.#trackSeenAt[trackId] = entry.ts
    row.name = entry.master_metadata_track_name
    row.artist_id = artistId
    row.album_id = albumId
  }

  #internEpisode(entry: StreamingHistoryEntry, uri: string): number {
    const showId = this.#internShow(entry.episode_show_name)
    const existing = this.#episodeIds.get(uri)
    if (existing === undefined) return this.#createEpisode(entry, uri, showId)
    if (entry.ts > this.#episodeSeenAt[existing]) {
      this.#episodeSeenAt[existing] = entry.ts
      this.#episodes[existing].name = entry.episode_name
      this.#episodes[existing].show_id = showId
    }
    return existing
  }

  #createEpisode(entry: StreamingHistoryEntry, uri: string, showId: number | null): number {
    const episodeId = this.#episodes.length
    this.#episodeIds.set(uri, episodeId)
    this.#episodes.push({ episode_id: episodeId, uri, name: entry.episode_name, show_id: showId })
    this.#episodeSeenAt.push(entry.ts)
    return episodeId
  }
}
