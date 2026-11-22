import { describe, expect, it } from 'vitest'
import { HistoryTableBuilder, PLAY_KIND, classifyPlay } from './tables.ts'
import type { StreamingHistoryEntry } from './tables.ts'

const BASE_ENTRY: StreamingHistoryEntry = {
  ts: '2020-01-01T00:00:00Z',
  platform: 'android',
  ms_played: 180000,
  conn_country: 'LV',
  ip_addr: '203.0.113.7',
  master_metadata_track_name: null,
  master_metadata_album_artist_name: null,
  master_metadata_album_album_name: null,
  spotify_track_uri: null,
  episode_name: null,
  episode_show_name: null,
  spotify_episode_uri: null,
  audiobook_title: null,
  audiobook_uri: null,
  audiobook_chapter_uri: null,
  audiobook_chapter_title: null,
  reason_start: 'trackdone',
  reason_end: 'trackdone',
  shuffle: false,
  skipped: false,
  offline: false,
  offline_timestamp: null,
  incognito_mode: false,
}

function trackEntry(overrides: Partial<StreamingHistoryEntry>): StreamingHistoryEntry {
  return {
    ...BASE_ENTRY,
    master_metadata_track_name: 'Aneeta',
    master_metadata_album_artist_name: 'Mecca:83',
    master_metadata_album_album_name: 'Loosies, Vol. 2',
    spotify_track_uri: 'spotify:track:5IyXL4qdlkFAF6JfnCBAGy',
    ...overrides,
  }
}

function episodeEntry(overrides: Partial<StreamingHistoryEntry>): StreamingHistoryEntry {
  return {
    ...BASE_ENTRY,
    episode_name: 'Drumming In The Clouds | CreepCast',
    episode_show_name: 'CreepCast',
    spotify_episode_uri: 'spotify:episode:2OQqVXKQrZNywLJ7BUA9pX',
    ...overrides,
  }
}

function build(entries: StreamingHistoryEntry[]) {
  const builder = new HistoryTableBuilder()
  builder.addFile(entries)
  return builder.finish()
}

describe('classifyPlay', () => {
  it('classifies by URI, in track then episode then audiobook order', () => {
    expect(classifyPlay(trackEntry({}))?.kind).toBe(PLAY_KIND.track)
    expect(classifyPlay(episodeEntry({}))?.kind).toBe(PLAY_KIND.episode)
    expect(
      classifyPlay({ ...BASE_ENTRY, audiobook_uri: 'spotify:show:4ZgmZCUmOUrsUr9Mwjy0vL' })?.kind,
    ).toBe(PLAY_KIND.audiobook)
  })

  it('returns null when the row carries no URI at all', () => {
    expect(classifyPlay(BASE_ENTRY)).toBeNull()
  })
})

describe('classifyPlay with absent fields', () => {
  it('treats a missing track URI as absent, not as a track play', () => {
    const { spotify_track_uri: _dropped, ...withoutUri } = BASE_ENTRY

    expect(classifyPlay(withoutUri as StreamingHistoryEntry)).toBeNull()
  })

  it('ignores an empty URI, which names nothing', () => {
    expect(classifyPlay({ ...BASE_ENTRY, spotify_track_uri: '' })).toBeNull()
  })
})

describe('HistoryTableBuilder', () => {
  it('counts rows with no URI as malformed instead of dropping them silently', () => {
    const tables = build([trackEntry({}), BASE_ENTRY, BASE_ENTRY])

    expect(tables.malformed).toBe(2)
    expect(tables.plays).toHaveLength(1)
  })

  it('dedupes a track on its URI and displays the most recently seen name', () => {
    const uri = 'spotify:track:0QZ5yyl6B6utIWkxeBDxQN'
    const tables = build([
      trackEntry({
        ts: '2021-06-01T00:00:00Z',
        spotify_track_uri: uri,
        master_metadata_track_name: 'Worries',
      }),
      trackEntry({
        ts: '2024-02-01T00:00:00Z',
        spotify_track_uri: uri,
        master_metadata_track_name: 'Worries (feat. Koda)',
      }),
      trackEntry({
        ts: '2022-01-01T00:00:00Z',
        spotify_track_uri: uri,
        master_metadata_track_name: 'Worries',
      }),
    ])

    expect(tables.tracks).toHaveLength(1)
    expect(tables.tracks[0].name).toBe('Worries (feat. Koda)')
    expect(tables.renamedTracks).toBe(1)
    expect(tables.plays).toHaveLength(3)
  })

  it('keeps albums of the same name under different artists apart', () => {
    const tables = build([
      trackEntry({
        spotify_track_uri: 'spotify:track:aaa',
        master_metadata_album_artist_name: 'Nas',
        master_metadata_album_album_name: 'Greatest Hits',
      }),
      trackEntry({
        spotify_track_uri: 'spotify:track:bbb',
        master_metadata_album_artist_name: 'Queen',
        master_metadata_album_album_name: 'Greatest Hits',
      }),
    ])

    expect(tables.artists).toHaveLength(2)
    expect(tables.albums).toHaveLength(2)
    expect(tables.albums[0].artist_id).not.toBe(tables.albums[1].artist_id)
  })

  it('backfills every play of a reattributed track to the canonical artist', () => {
    const uri = 'spotify:track:7xQAfvXzm3AkraOtGPWIZg'
    const tables = build([
      trackEntry({
        ts: '2019-01-01T00:00:00Z',
        spotify_track_uri: uri,
        master_metadata_album_artist_name: 'Lil Peep',
      }),
      trackEntry({
        ts: '2023-01-01T00:00:00Z',
        spotify_track_uri: uri,
        master_metadata_album_artist_name: 'Lil Peep & XXXTENTACION',
      }),
    ])

    const canonical = tables.tracks[0].artist_id
    expect(tables.reattributedTracks).toBe(1)
    expect(tables.plays.map((play) => play.artist_id)).toEqual([canonical, canonical])
  })

  it('links episodes to their show and never to an artist', () => {
    const tables = build([episodeEntry({}), episodeEntry({ ts: '2026-02-01T00:00:00Z' })])

    expect(tables.episodes).toHaveLength(1)
    expect(tables.shows).toHaveLength(1)
    expect(tables.episodes[0].show_id).toBe(tables.shows[0].show_id)
    expect(tables.plays[0].artist_id).toBeNull()
    expect(tables.plays[0].track_id).toBeNull()
  })

  it('never copies ip_addr into a play row', () => {
    const tables = build([trackEntry({})])

    expect(JSON.stringify(tables.plays)).not.toContain(BASE_ENTRY.ip_addr)
  })
})
