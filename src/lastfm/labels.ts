import { AUTOCORRECT_ON, LAST_FM_METHODS, lastFmGet } from './api'

export const LABEL_SOURCE = {
  track: 'track',
  artist: 'artist',
} as const

export type LabelSource = (typeof LABEL_SOURCE)[keyof typeof LABEL_SOURCE]

export interface Label {
  name: string
  weight: number
  source: LabelSource
}

export interface LabelContext {
  artist: string
  track?: string
}

// Tags are user-submitted, so alongside genres they carry radio-station names,
// decades, the artist's own name and outright junk ("-1001740215468"). Counts
// cannot be used to separate them: 16 Horsepower's "southern gothic" scores 1,
// the same as the noise, so the filter has to be structural.
const MAX_LABEL_LENGTH = 30

const PERSONAL_LABELS = new Set([
  'seen live',
  'favourites',
  'favorites',
  'favourite songs',
  'favorite songs',
  'favourite',
  'favorite',
  'albums i own',
  'my music',
  'my favourites',
  'my favorites',
  'awesome',
  'amazing',
  'beautiful',
  'love',
  'love at first listen',
  'check out',
  'to check out',
  'best songs ever',
  'music',
  'songs',
  'spotify',
  'under 2000 listeners',
])

const YEAR_OR_DECADE = /^(19|20)?\d{2}'?s?$/
const DIGITS_ONLY = /^[-+]?\d+$/
const RADIO_STATION = /\b(fm|am|radio|dj|podcast|playlist)\b/

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isNoise(name: string, context: LabelContext): boolean {
  const tag = normalise(name)
  const artist = normalise(context.artist)
  const track = context.track === undefined ? null : normalise(context.track)

  if (tag === '' || tag.length > MAX_LABEL_LENGTH) return true
  if (DIGITS_ONLY.test(tag) || YEAR_OR_DECADE.test(tag)) return true
  if (RADIO_STATION.test(tag)) return true
  if (PERSONAL_LABELS.has(tag)) return true

  return tag === artist || tag === track
}

function readTagArray(body: Record<string, unknown>): Array<{ name: string; count: number }> {
  const container = body.toptags
  if (typeof container !== 'object' || container === null) return []

  const raw = (container as Record<string, unknown>).tag
  if (!Array.isArray(raw)) return []

  return raw.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []

    const { name, count } = entry as Record<string, unknown>
    if (typeof name !== 'string') return []

    return [{ name, count: Number(count) }]
  })
}

function toLabels(
  body: Record<string, unknown>,
  context: LabelContext,
  source: LabelSource,
): Label[] {
  return readTagArray(body)
    .filter((tag) => !isNoise(tag.name, context))
    .map((tag) => ({
      name: tag.name.trim(),
      weight: Number.isFinite(tag.count) ? tag.count : 0,
      source,
    }))
}

/**
 * Track tags beat artist tags when both carry the same label, because a tag on
 * the song is a stronger claim than one on everything the artist has recorded.
 */
export function mergeLabels(trackLabels: Label[], artistLabels: Label[]): Label[] {
  const merged = new Map<string, Label>()

  for (const label of [...artistLabels, ...trackLabels]) {
    const key = normalise(label.name)
    const existing = merged.get(key)
    merged.set(
      key,
      existing === undefined
        ? label
        : { ...label, weight: Math.max(existing.weight, label.weight) },
    )
  }

  return [...merged.values()].sort((a, b) => b.weight - a.weight)
}

export async function fetchTrackLabels(context: LabelContext): Promise<Label[]> {
  if (context.track === undefined) return []

  const body = await lastFmGet(LAST_FM_METHODS.trackTopTags, {
    artist: context.artist,
    track: context.track,
    autocorrect: AUTOCORRECT_ON,
  })

  return toLabels(body, context, LABEL_SOURCE.track)
}

export async function fetchArtistLabels(context: LabelContext): Promise<Label[]> {
  const body = await lastFmGet(LAST_FM_METHODS.artistTopTags, {
    artist: context.artist,
    autocorrect: AUTOCORRECT_ON,
  })

  return toLabels(body, context, LABEL_SOURCE.artist)
}

/**
 * Track tags are sparse — Red Right Hand has 305k listeners and none — so the
 * artist's tags are the floor rather than an enrichment.
 */
export async function fetchLabels(context: LabelContext): Promise<Label[]> {
  const [trackLabels, artistLabels] = await Promise.all([
    fetchTrackLabels(context).catch(() => []),
    fetchArtistLabels(context).catch(() => []),
  ])

  return mergeLabels(trackLabels, artistLabels)
}
