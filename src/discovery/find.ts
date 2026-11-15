import type { Candidate } from '../lastfm/discovery'
import {
  fetchArtistTracks,
  fetchSimilarArtists,
  fetchSimilarTracks,
  fetchTracksForLabel,
} from '../lastfm/discovery'
import { fetchArtistLabels } from '../lastfm/labels'
import type { Label } from '../lastfm/labels'
import { artistKey, dedupe, rankCandidates } from './score'
import type { ScoredCandidate } from './score'

export interface Seed {
  artist: string
  track: string
}

export interface FindOptions {
  seed: Seed
  selected: Label[]
  familiarArtists: ReadonlySet<string>
}

// Every unique artist costs one Last.fm call to label, so the pool is capped
// rather than left to grow with however many labels were ticked.
const MAX_LABELLED_ARTISTS = 40
const MAX_SIMILAR_ARTISTS = 8
export const MAX_RESULTS = 30

// Without this one heavily tagged artist contributes most of the page, which
// reads as padding rather than as one strong match.
export const MAX_TRACKS_PER_ARTIST = 4

function capPerArtist(scored: ScoredCandidate[]): ScoredCandidate[] {
  const counts = new Map<string, number>()

  return scored.filter((candidate) => {
    const key = artistKey(candidate.artist)
    const seen = counts.get(key) ?? 0
    counts.set(key, seen + 1)

    return seen < MAX_TRACKS_PER_ARTIST
  })
}

async function gatherCandidates(seed: Seed, selected: Label[]): Promise<Candidate[]> {
  const similarArtists = await fetchSimilarArtists(seed.artist).catch(() => [])
  const topSimilar = similarArtists.slice(0, MAX_SIMILAR_ARTISTS)

  const batches = await Promise.all([
    fetchSimilarTracks(seed.artist, seed.track).catch(() => []),
    ...selected.map((label) => fetchTracksForLabel(label.name).catch(() => [])),
    ...topSimilar.map((artist) => fetchArtistTracks(artist.name).catch(() => [])),
  ])

  return batches
    .flat()
    .filter((candidate) => artistKey(candidate.artist) !== artistKey(seed.artist))
}

async function labelArtists(candidates: Candidate[]): Promise<Map<string, Label[]>> {
  const names = new Map<string, string>()
  for (const candidate of candidates) {
    if (names.size >= MAX_LABELLED_ARTISTS) break
    names.set(artistKey(candidate.artist), candidate.artist)
  }

  const entries = await Promise.all(
    [...names].map(async ([key, name]): Promise<[string, Label[]]> => {
      const labels = await fetchArtistLabels({ artist: name }).catch(() => [])
      return [key, labels]
    }),
  )

  return new Map(entries)
}

export async function findSimilar({
  seed,
  selected,
  familiarArtists,
}: FindOptions): Promise<ScoredCandidate[]> {
  const candidates = await gatherCandidates(seed, selected)
  const labelsByArtist = await labelArtists(candidates)

  const ranked = rankCandidates({ candidates, selected, labelsByArtist, familiarArtists })

  return capPerArtist(dedupe(ranked)).slice(0, MAX_RESULTS)
}
