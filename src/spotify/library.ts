import { z } from 'zod'
import { spotifyGet } from './api'

export interface SpotifyTrackRef {
  id: string
  title: string
  artists: string[]
  spotifyUrl: string | null
  artworkUrl: string | null
}

const SEARCH_TYPE_TRACK = 'track'
const TOP_TYPE_ARTISTS = 'artists'
const TOP_TYPE_TRACKS = 'tracks'
const TIME_RANGE_LONG = 'long_term'

const SEARCH_LIMIT = '10'
const HISTORY_LIMIT = '50'

const artistSchema = z.object({ name: z.string() })

const trackSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(artistSchema),
  external_urls: z.object({ spotify: z.string() }).partial().optional(),
  album: z
    .object({ images: z.array(z.object({ url: z.string() })).optional() })
    .partial()
    .optional(),
})

const searchSchema = z.object({ tracks: z.object({ items: z.array(trackSchema) }) })
const topArtistsSchema = z.object({ items: z.array(artistSchema) })
const topTracksSchema = z.object({ items: z.array(trackSchema) })
const recentlyPlayedSchema = z.object({ items: z.array(z.object({ track: trackSchema })) })

type RawTrack = z.infer<typeof trackSchema>

function toTrackRef(track: RawTrack): SpotifyTrackRef {
  return {
    id: track.id,
    title: track.name,
    artists: track.artists.map((artist) => artist.name),
    spotifyUrl: track.external_urls?.spotify ?? null,
    artworkUrl: track.album?.images?.[0]?.url ?? null,
  }
}

function searchPath(query: string, limit: string): string {
  const params = new URLSearchParams({ q: query, type: SEARCH_TYPE_TRACK, limit })

  return `/search?${params.toString()}`
}

export async function searchTracks(query: string): Promise<SpotifyTrackRef[]> {
  if (query.trim() === '') return []

  const payload = searchSchema.parse(await spotifyGet(searchPath(query, SEARCH_LIMIT)))

  return payload.tracks.items.map(toTrackRef)
}

/**
 * `GET /artists/{id}/top-tracks` is deprecated, so a Last.fm result is turned
 * back into something playable by searching for it rather than by lookup.
 */
export async function findTrack(artist: string, title: string): Promise<SpotifyTrackRef | null> {
  const query = `track:${title} artist:${artist}`
  const payload = searchSchema.parse(await spotifyGet(searchPath(query, '1')))

  return payload.tracks.items[0] === undefined ? null : toTrackRef(payload.tracks.items[0])
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

async function readTopArtists(): Promise<string[]> {
  const params = new URLSearchParams({ time_range: TIME_RANGE_LONG, limit: HISTORY_LIMIT })
  const payload = topArtistsSchema.parse(
    await spotifyGet(`/me/top/${TOP_TYPE_ARTISTS}?${params.toString()}`),
  )

  return payload.items.map((artist) => artist.name)
}

async function readTopTrackArtists(): Promise<string[]> {
  const params = new URLSearchParams({ time_range: TIME_RANGE_LONG, limit: HISTORY_LIMIT })
  const payload = topTracksSchema.parse(
    await spotifyGet(`/me/top/${TOP_TYPE_TRACKS}?${params.toString()}`),
  )

  return payload.items.flatMap((track) => track.artists.map((artist) => artist.name))
}

async function readRecentArtists(): Promise<string[]> {
  const params = new URLSearchParams({ limit: HISTORY_LIMIT })
  const payload = recentlyPlayedSchema.parse(
    await spotifyGet(`/me/player/recently-played?${params.toString()}`),
  )

  return payload.items.flatMap((entry) => entry.track.artists.map((artist) => artist.name))
}

/**
 * A missing scope or an empty history should soften the ranking, not break the
 * page, so each source is allowed to fail on its own.
 */
export async function fetchFamiliarArtists(): Promise<Set<string>> {
  const sources = await Promise.all([
    readTopArtists().catch(() => []),
    readTopTrackArtists().catch(() => []),
    readRecentArtists().catch(() => []),
  ])

  return new Set(sources.flat().map(normaliseName))
}
