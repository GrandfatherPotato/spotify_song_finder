import { AUTOCORRECT_ON, LAST_FM_METHODS, lastFmGet } from './api'

export const CANDIDATE_SOURCE = {
  label: 'label',
  similarArtist: 'similar-artist',
  similarTrack: 'similar-track',
} as const

export type CandidateSource = (typeof CANDIDATE_SOURCE)[keyof typeof CANDIDATE_SOURCE]

export interface Candidate {
  artist: string
  title: string
  source: CandidateSource
  /** 0–1. Last.fm's own match score where it gives one, rank-derived otherwise. */
  affinity: number
  viaLabel: string | null
}

export interface SimilarArtist {
  name: string
  match: number
}

const DEFAULT_LIMIT = '50'
const SIMILAR_ARTIST_LIMIT = '20'

function readList(container: unknown, key: string): Array<Record<string, unknown>> {
  if (typeof container !== 'object' || container === null) return []

  const raw = (container as Record<string, unknown>)[key]
  if (!Array.isArray(raw)) return []

  return raw.filter(
    (entry: unknown): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null,
  )
}

function readString(entry: Record<string, unknown>, key: string): string | null {
  const value = entry[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function readArtistName(entry: Record<string, unknown>): string | null {
  const artist = entry.artist
  if (typeof artist === 'string') return artist
  if (typeof artist !== 'object' || artist === null) return null

  return readString(artist as Record<string, unknown>, 'name')
}

/** Last.fm returns results ranked but unscored, so position stands in for one. */
function rankAffinity(index: number, total: number): number {
  if (total <= 1) return 1

  return 1 - index / total
}

function toCandidates(
  entries: Array<Record<string, unknown>>,
  source: CandidateSource,
  viaLabel: string | null,
): Candidate[] {
  return entries.flatMap((entry, index) => {
    const title = readString(entry, 'name')
    const artist = readArtistName(entry)
    if (title === null || artist === null) return []

    const match = Number(entry.match)

    return [
      {
        artist,
        title,
        source,
        affinity: Number.isFinite(match) ? match : rankAffinity(index, entries.length),
        viaLabel,
      },
    ]
  })
}

export async function fetchTracksForLabel(label: string): Promise<Candidate[]> {
  const body = await lastFmGet(LAST_FM_METHODS.tagTopTracks, {
    tag: label,
    limit: DEFAULT_LIMIT,
  })

  return toCandidates(readList(body.tracks, 'track'), CANDIDATE_SOURCE.label, label)
}

export async function fetchSimilarTracks(artist: string, track: string): Promise<Candidate[]> {
  const body = await lastFmGet(LAST_FM_METHODS.trackSimilar, {
    artist,
    track,
    autocorrect: AUTOCORRECT_ON,
    limit: DEFAULT_LIMIT,
  })

  return toCandidates(readList(body.similartracks, 'track'), CANDIDATE_SOURCE.similarTrack, null)
}

const ARTIST_TRACK_LIMIT = '10'

export async function fetchArtistTracks(artist: string): Promise<Candidate[]> {
  const body = await lastFmGet(LAST_FM_METHODS.artistTopTracks, {
    artist,
    autocorrect: AUTOCORRECT_ON,
    limit: ARTIST_TRACK_LIMIT,
  })

  return toCandidates(readList(body.toptracks, 'track'), CANDIDATE_SOURCE.similarArtist, null)
}

export async function fetchSimilarArtists(artist: string): Promise<SimilarArtist[]> {
  const body = await lastFmGet(LAST_FM_METHODS.artistSimilar, {
    artist,
    autocorrect: AUTOCORRECT_ON,
    limit: SIMILAR_ARTIST_LIMIT,
  })

  // The envelope is `similarartists` on most responses but `artist` on some.
  const entries = [...readList(body.similarartists, 'artist'), ...readList(body.artist, 'artist')]

  return entries.flatMap((entry, index) => {
    const name = readString(entry, 'name')
    if (name === null) return []

    const match = Number(entry.match)

    return [{ name, match: Number.isFinite(match) ? match : rankAffinity(index, entries.length) }]
  })
}
