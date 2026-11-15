import { describe, expect, it } from 'vitest'
import { CANDIDATE_SOURCE } from '../lastfm/discovery'
import type { Candidate } from '../lastfm/discovery'
import type { Label } from '../lastfm/labels'
import { dedupe, groupByArtist, labelOverlap, rankCandidates } from './score'

function label(name: string, weight: number): Label {
  return { name, weight, source: 'artist' }
}

function candidate(artist: string, title: string, affinity = 0.5): Candidate {
  return { artist, title, affinity, source: CANDIDATE_SOURCE.label, viaLabel: null }
}

const SELECTED = [label('southern gothic', 100), label('americana', 60), label('folk', 40)]

describe('labelOverlap', () => {
  it('is 0 when nothing overlaps', () => {
    expect(labelOverlap(SELECTED, [label('techno', 100)])).toBe(0)
  })

  it('is 1 when the candidate maxes out every selected label', () => {
    expect(
      labelOverlap(SELECTED, [
        label('southern gothic', 100),
        label('americana', 100),
        label('folk', 100),
      ]),
    ).toBeCloseTo(1)
  })

  it('scores a faintly tagged complete match far below a strongly tagged partial one', () => {
    const faintComplete = labelOverlap(SELECTED, [
      label('southern gothic', 3),
      label('americana', 2),
      label('folk', 2),
    ])
    const strongPartial = labelOverlap(SELECTED, [
      label('southern gothic', 100),
      label('americana', 90),
    ])

    expect(strongPartial).toBeGreaterThan(faintComplete)
  })

  it('weights by the share each selected label holds in the selection', () => {
    const topLabelOnly = labelOverlap(SELECTED, [label('southern gothic', 100)])
    const leastLabelOnly = labelOverlap(SELECTED, [label('folk', 100)])

    expect(topLabelOnly).toBeGreaterThan(leastLabelOnly)
  })
})

describe('rankCandidates', () => {
  it('ranks a strong partial match above a weak complete one', () => {
    const strongPartial = candidate('16 Horsepower', 'Black Soul Choir')
    const weakComplete = candidate('Generic Folk Act', 'A Song')

    const ranked = rankCandidates({
      candidates: [weakComplete, strongPartial],
      selected: SELECTED,
      labelsByArtist: new Map([
        ['16 horsepower', [label('southern gothic', 100), label('americana', 90)]],
        [
          'generic folk act',
          [label('southern gothic', 3), label('americana', 2), label('folk', 2)],
        ],
      ]),
      familiarArtists: new Set(),
    })

    expect(ranked[0]?.artist).toBe('16 Horsepower')
  })

  it('keeps a candidate that matches only one of the selected labels', () => {
    const ranked = rankCandidates({
      candidates: [candidate('Woven Hand', 'Sparrow Falls')],
      selected: SELECTED,
      labelsByArtist: new Map([['woven hand', [label('southern gothic', 100)]]]),
      familiarArtists: new Set(),
    })

    expect(ranked[0]?.score).toBeGreaterThan(0)
    expect(ranked[0]?.matchedLabels).toEqual(['southern gothic'])
  })

  it('does not drop a candidate whose labels are unknown', () => {
    const ranked = rankCandidates({
      candidates: [candidate('Unknown Act', 'Untagged', 0.9)],
      selected: SELECTED,
      labelsByArtist: new Map(),
      familiarArtists: new Set(),
    })

    expect(ranked).toHaveLength(1)
    expect(ranked[0]?.score).toBeGreaterThan(0)
  })

  it('boosts an artist the listener already knows without requiring it', () => {
    const labelsByArtist = new Map([['woven hand', [label('southern gothic', 100)]]])
    const options = {
      candidates: [candidate('Woven Hand', 'Sparrow Falls')],
      selected: SELECTED,
      labelsByArtist,
    }

    const unfamiliar = rankCandidates({ ...options, familiarArtists: new Set() })
    const familiar = rankCandidates({ ...options, familiarArtists: new Set(['woven hand']) })

    expect(familiar[0]?.score).toBeGreaterThan(unfamiliar[0]?.score ?? 0)
    expect(familiar[0]?.familiar).toBe(true)
  })

  it('reports each result its own labels so the search can be refined', () => {
    const ranked = rankCandidates({
      candidates: [candidate('The Handsome Family', 'Weightless Again')],
      selected: SELECTED,
      labelsByArtist: new Map([
        ['the handsome family', [label('southern gothic', 15), label('gothic americana', 5)]],
      ]),
      familiarArtists: new Set(),
    })

    expect(ranked[0]?.labels.map((entry) => entry.name)).toEqual([
      'southern gothic',
      'gothic americana',
    ])
  })
})

describe('groupByArtist', () => {
  // Equal labels so these cases turn on grouping and affinity, not on overlap.
  const labelsByArtist = new Map([
    ['lana del rey', [label('southern gothic', 100)]],
    ['woven hand', [label('southern gothic', 100)]],
  ])

  function rank(pairs: Array<[string, string, number]>): ReturnType<typeof rankCandidates> {
    return rankCandidates({
      candidates: pairs.map(([artist, title, affinity]) => candidate(artist, title, affinity)),
      selected: SELECTED,
      labelsByArtist,
      familiarArtists: new Set(['lana del rey']),
    })
  }

  it('collapses one artist scattered through the list into a single section', () => {
    const groups = groupByArtist(
      rank([
        ['Lana Del Rey', 'Ultraviolence', 0.9],
        ['Woven Hand', 'Sparrow Falls', 0.8],
        ['Lana Del Rey', 'West Coast', 0.7],
        ['Lana Del Rey', 'Shades of Cool', 0.6],
      ]),
    )

    expect(groups.map((group) => group.artist)).toEqual(['Lana Del Rey', 'Woven Hand'])
    expect(groups[0]?.tracks.map((track) => track.title)).toEqual([
      'Ultraviolence',
      'West Coast',
      'Shades of Cool',
    ])
  })

  it('ranks an artist by their strongest track', () => {
    const groups = groupByArtist(
      rank([
        ['Lana Del Rey', 'West Coast', 0.1],
        ['Woven Hand', 'Sparrow Falls', 0.9],
      ]),
    )

    expect(groups[0]?.artist).toBe('Woven Hand')
  })

  it('carries the familiarity flag onto the section', () => {
    const groups = groupByArtist(rank([['Lana Del Rey', 'West Coast', 0.5]]))

    expect(groups[0]?.familiar).toBe(true)
  })
})

describe('dedupe', () => {
  it('keeps the strongest entry for a repeated track', () => {
    const ranked = rankCandidates({
      candidates: [
        candidate('Woven Hand', 'Sparrow Falls', 0.2),
        candidate('woven hand', 'sparrow falls', 0.9),
      ],
      selected: SELECTED,
      labelsByArtist: new Map([['woven hand', [label('southern gothic', 100)]]]),
      familiarArtists: new Set(),
    })

    const unique = dedupe(ranked)

    expect(unique).toHaveLength(1)
    expect(unique[0]?.score).toBe(ranked[0]?.score)
  })
})
