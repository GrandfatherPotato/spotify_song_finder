import { LEADERBOARD_ENTITY } from './duckdb/queries'
import type { LeaderboardEntity } from './duckdb/queries'

export const ITEM_PARAM = {
  type: 'type',
  name: 'name',
  artist: 'artist',
  uri: 'uri',
} as const

export interface ArtistRef {
  entity: typeof LEADERBOARD_ENTITY.artist
  name: string
}

export interface SongRef {
  entity: typeof LEADERBOARD_ENTITY.song
  uri: string
}

export interface AlbumRef {
  entity: typeof LEADERBOARD_ENTITY.album
  name: string
  artist: string | null
}

/**
 * Addressed by natural key, never by `artist_id` and friends: those are array
 * indices handed out during import, so a re-import points the same URL at
 * somebody else. Songs carry a stable Spotify URI; the export gives artists
 * and albums nothing but their name.
 */
export type ItemRef = ArtistRef | SongRef | AlbumRef

export interface NamedRow {
  name: string | null
  subtitle: string | null
  uri: string | null
}

/** Null when the row carries no usable key — an unnamed artist, a track with no URI. */
export function itemRefFor(entity: LeaderboardEntity, row: NamedRow): ItemRef | null {
  if (entity === LEADERBOARD_ENTITY.song) {
    return row.uri === null ? null : { entity: LEADERBOARD_ENTITY.song, uri: row.uri }
  }
  if (row.name === null) return null
  if (entity === LEADERBOARD_ENTITY.artist) {
    return { entity: LEADERBOARD_ENTITY.artist, name: row.name }
  }
  return { entity: LEADERBOARD_ENTITY.album, name: row.name, artist: row.subtitle }
}

function single(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function parseItemRef(query: Record<string, unknown>): ItemRef | null {
  const type = single(query[ITEM_PARAM.type])
  const name = single(query[ITEM_PARAM.name])
  if (type === LEADERBOARD_ENTITY.song) {
    const uri = single(query[ITEM_PARAM.uri])
    return uri === null ? null : { entity: LEADERBOARD_ENTITY.song, uri }
  }
  if (type === LEADERBOARD_ENTITY.artist && name !== null) {
    return { entity: LEADERBOARD_ENTITY.artist, name }
  }
  if (type === LEADERBOARD_ENTITY.album && name !== null) {
    return {
      entity: LEADERBOARD_ENTITY.album,
      name,
      artist: single(query[ITEM_PARAM.artist]),
    }
  }
  return null
}

export function itemRefQuery(ref: ItemRef): Record<string, string> {
  if (ref.entity === LEADERBOARD_ENTITY.song) {
    return { [ITEM_PARAM.type]: ref.entity, [ITEM_PARAM.uri]: ref.uri }
  }
  if (ref.entity === LEADERBOARD_ENTITY.artist) {
    return { [ITEM_PARAM.type]: ref.entity, [ITEM_PARAM.name]: ref.name }
  }
  const album: Record<string, string> = {
    [ITEM_PARAM.type]: ref.entity,
    [ITEM_PARAM.name]: ref.name,
  }
  if (ref.artist !== null) album[ITEM_PARAM.artist] = ref.artist
  return album
}

export function itemRefKey(ref: ItemRef): string {
  return Object.entries(itemRefQuery(ref))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
}
