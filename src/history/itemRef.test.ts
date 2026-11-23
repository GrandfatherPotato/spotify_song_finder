import { describe, expect, it } from 'vitest'
import { LEADERBOARD_ENTITY } from './duckdb/queries'
import { itemRefKey, itemRefQuery, parseItemRef } from './itemRef'
import type { ItemRef } from './itemRef'

const ARTIST: ItemRef = { entity: LEADERBOARD_ENTITY.artist, name: 'Radiohead' }
const SONG: ItemRef = { entity: LEADERBOARD_ENTITY.song, uri: 'spotify:track:abc' }
const ALBUM: ItemRef = { entity: LEADERBOARD_ENTITY.album, name: 'Kid A', artist: 'Radiohead' }

describe('parseItemRef', () => {
  it('reads an artist from its name', () => {
    expect(parseItemRef({ type: 'artist', name: 'Radiohead' })).toEqual(ARTIST)
  })

  it('reads a song from its URI, which survives a re-import', () => {
    expect(parseItemRef({ type: 'song', uri: 'spotify:track:abc' })).toEqual(SONG)
  })

  it('reads an album from its name and artist', () => {
    expect(parseItemRef({ type: 'album', name: 'Kid A', artist: 'Radiohead' })).toEqual(ALBUM)
  })

  it('accepts an album whose artist the export never named', () => {
    expect(parseItemRef({ type: 'album', name: 'Untitled' })).toEqual({
      entity: LEADERBOARD_ENTITY.album,
      name: 'Untitled',
      artist: null,
    })
  })

  it('refuses a song without a URI rather than guessing from a name', () => {
    expect(parseItemRef({ type: 'song', name: 'Creep' })).toBeNull()
  })

  it('refuses an unknown or absent type', () => {
    expect(parseItemRef({ type: 'playlist', name: 'Mix' })).toBeNull()
    expect(parseItemRef({ name: 'Radiohead' })).toBeNull()
    expect(parseItemRef({})).toBeNull()
  })

  it('refuses a repeated parameter, which arrives as an array', () => {
    expect(parseItemRef({ type: 'artist', name: ['Radiohead', 'Bonobo'] })).toBeNull()
  })

  it('refuses a parameter inherited from the prototype', () => {
    expect(parseItemRef({ type: 'artist', name: 'constructor' })).toEqual({
      entity: LEADERBOARD_ENTITY.artist,
      name: 'constructor',
    })
    expect(parseItemRef({ type: 'constructor' })).toBeNull()
  })
})

describe('itemRefQuery', () => {
  it('round-trips every kind of reference', () => {
    for (const ref of [ARTIST, SONG, ALBUM]) {
      expect(parseItemRef(itemRefQuery(ref))).toEqual(ref)
    }
  })

  it('leaves the artist out entirely when the album has none', () => {
    const ref: ItemRef = { entity: LEADERBOARD_ENTITY.album, name: 'Untitled', artist: null }

    expect(itemRefQuery(ref)).toEqual({ type: 'album', name: 'Untitled' })
  })

  it('addresses a song by URI and never by name', () => {
    expect(itemRefQuery(SONG)).toEqual({ type: 'song', uri: 'spotify:track:abc' })
  })
})

describe('itemRefKey', () => {
  it('tells two references apart', () => {
    expect(itemRefKey(ARTIST)).not.toBe(itemRefKey(SONG))
  })

  it('is stable for the same reference', () => {
    expect(itemRefKey(ALBUM)).toBe(itemRefKey({ ...ALBUM }))
  })
})
