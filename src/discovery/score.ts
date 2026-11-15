import type { Candidate } from '../lastfm/discovery'
import type { Label } from '../lastfm/labels'

export interface ScoredCandidate {
  artist: string
  title: string
  score: number
  matchedLabels: string[]
  labels: Label[]
  familiar: boolean
  source: Candidate['source']
  viaLabel: string | null
}

export interface RankOptions {
  candidates: Candidate[]
  selected: Label[]
  labelsByArtist: ReadonlyMap<string, Label[]>
  familiarArtists: ReadonlySet<string>
}

/**
 * A candidate matching two of four selected labels strongly should beat one
 * matching all four weakly, so overlap is weighted rather than treated as a set
 * intersection — see labelOverlap. Nothing is excluded for missing a label.
 */
const LABEL_WEIGHT = 0.6
const AFFINITY_WEIGHT = 0.25
const FAMILIARITY_WEIGHT = 0.15

/** Last.fm scales a tag's count against the artist's own top tag, which is 100. */
const MAX_LABEL_WEIGHT = 100

export function artistKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function toVector(labels: Label[]): Map<string, number> {
  const vector = new Map<string, number>()

  for (const label of labels) {
    const key = artistKey(label.name)
    vector.set(key, Math.max(vector.get(key) ?? 0, label.weight))
  }

  return vector
}

/**
 * How much of the selected mix a candidate actually embodies, 0–1.
 *
 * Deliberately not cosine similarity: that is scale-invariant, so an artist
 * whose tags are `southern gothic (3), americana (2)` scores the same as one
 * at `(100, 90)`. Last.fm counts are relative to the artist's own top tag, so
 * a low count means the label is marginal to them — magnitude is the signal.
 */
export function labelOverlap(selected: Label[], candidateLabels: Label[]): number {
  const totalWeight = selected.reduce((sum, label) => sum + label.weight, 0)
  if (totalWeight === 0) return 0

  const candidate = toVector(candidateLabels)
  let overlap = 0

  for (const label of selected) {
    const share = label.weight / totalWeight
    const strength = Math.min(candidate.get(artistKey(label.name)) ?? 0, MAX_LABEL_WEIGHT)
    overlap += share * (strength / MAX_LABEL_WEIGHT)
  }

  return overlap
}

function matchedLabelNames(selected: Label[], candidate: ReadonlyMap<string, number>): string[] {
  return selected.filter((label) => candidate.has(artistKey(label.name))).map((label) => label.name)
}

export function rankCandidates({
  candidates,
  selected,
  labelsByArtist,
  familiarArtists,
}: RankOptions): ScoredCandidate[] {
  return candidates
    .map((candidate) => score(candidate, selected, labelsByArtist, familiarArtists))
    .sort((a, b) => b.score - a.score)
}

function score(
  candidate: Candidate,
  selected: Label[],
  labelsByArtist: ReadonlyMap<string, Label[]>,
  familiarArtists: ReadonlySet<string>,
): ScoredCandidate {
  const key = artistKey(candidate.artist)
  const labels = labelsByArtist.get(key) ?? []
  const overlap = labelOverlap(selected, labels)
  const familiar = familiarArtists.has(key)

  return {
    artist: candidate.artist,
    title: candidate.title,
    score:
      overlap * LABEL_WEIGHT +
      candidate.affinity * AFFINITY_WEIGHT +
      (familiar ? FAMILIARITY_WEIGHT : 0),
    matchedLabels: matchedLabelNames(selected, toVector(labels)),
    labels,
    familiar,
    source: candidate.source,
    viaLabel: candidate.viaLabel,
  }
}

export interface ArtistGroup {
  artist: string
  score: number
  familiar: boolean
  labels: Label[]
  matchedLabels: string[]
  tracks: ScoredCandidate[]
}

/**
 * One artist, one section. Ungrouped, a well-tagged artist scatters half a
 * dozen tracks down the list and reads as padding rather than as one strong
 * match. Groups rank by their best track so the top result stays on top.
 */
export function groupByArtist(scored: ScoredCandidate[]): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup>()

  for (const candidate of scored) {
    const key = artistKey(candidate.artist)
    const existing = groups.get(key)

    if (existing === undefined) {
      groups.set(key, {
        artist: candidate.artist,
        score: candidate.score,
        familiar: candidate.familiar,
        labels: candidate.labels,
        matchedLabels: candidate.matchedLabels,
        tracks: [candidate],
      })
      continue
    }

    existing.tracks.push(candidate)
    existing.score = Math.max(existing.score, candidate.score)
  }

  return [...groups.values()]
    .map((group) => ({ ...group, tracks: [...group.tracks].sort((a, b) => b.score - a.score) }))
    .sort((a, b) => b.score - a.score)
}

/** Keeps the strongest entry per artist+title so one track cannot fill the page. */
export function dedupe(scored: ScoredCandidate[]): ScoredCandidate[] {
  const best = new Map<string, ScoredCandidate>()

  for (const candidate of scored) {
    const key = `${artistKey(candidate.artist)} — ${artistKey(candidate.title)}`
    const existing = best.get(key)
    if (existing === undefined || candidate.score > existing.score) best.set(key, candidate)
  }

  return [...best.values()].sort((a, b) => b.score - a.score)
}
