import { describe, expect, it } from 'vitest'
import { groupSongsByAlbum } from './grouping'
import { UNNAMED } from './labels'

function song(id: number, name: string, album: string | null, plays: number, hours: number) {
  return { id, name, subtitle: album, uri: `spotify:track:${id}`, plays, hours }
}

describe('groupSongsByAlbum', () => {
  it('puts the album you played most at the top', () => {
    const groups = groupSongsByAlbum([
      song(1, 'Creep', 'The Bends', 10, 1),
      song(2, 'Idioteque', 'Kid A', 50, 5),
      song(3, 'Fake Plastic Trees', 'The Bends', 20, 2),
    ])

    expect(groups.map((group) => group.album)).toEqual(['Kid A', 'The Bends'])
  })

  it('totals the plays and hours of the songs it holds', () => {
    const [bends] = groupSongsByAlbum([
      song(1, 'Creep', 'The Bends', 10, 1.2),
      song(3, 'Fake Plastic Trees', 'The Bends', 20, 2.3),
    ])

    expect(bends.plays).toBe(30)
    expect(bends.hours).toBe(3.5)
  })

  it('keeps the songs in the order the query ranked them', () => {
    const [group] = groupSongsByAlbum([
      song(1, 'Creep', 'The Bends', 20, 2),
      song(3, 'Fake Plastic Trees', 'The Bends', 10, 1),
    ])

    expect(group.songs.map((one) => one.name)).toEqual(['Creep', 'Fake Plastic Trees'])
  })

  it('gathers songs the export never placed on an album rather than dropping them', () => {
    const groups = groupSongsByAlbum([song(1, 'Untitled', null, 5, 1)])

    expect(groups).toHaveLength(1)
    expect(groups[0].album).toBe(UNNAMED)
  })

  it('has nothing to group when there are no songs', () => {
    expect(groupSongsByAlbum([])).toEqual([])
  })
})
