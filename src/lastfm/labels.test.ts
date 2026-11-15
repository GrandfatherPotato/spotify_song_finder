import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAST_FM_METHODS } from './api'
import type * as LabelsModule from './labels'

const API_KEY = 'lastfm-key-123'
const CONTEXT = { artist: '16 Horsepower', track: 'Black Soul Choir' }

const fetchMock = vi.fn()

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function tagsPayload(tags: Array<{ name: string; count: number }>): unknown {
  return { toptags: { tag: tags } }
}

function respond(byMethod: Record<string, unknown>): void {
  fetchMock.mockImplementation((url: URL) => {
    const method = new URL(url).searchParams.get('method') ?? ''
    return Promise.resolve(jsonResponse(byMethod[method]))
  })
}

// env/schema.ts parses import.meta.env when src/env.ts is first imported, so
// the key has to be stubbed before the module graph is built.
async function loadLabels(): Promise<typeof LabelsModule> {
  vi.resetModules()
  return import('./labels')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_LAST_FM_API_KEY', API_KEY)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('fetchLabels', () => {
  it('merges track and artist tags into one list, strongest first', async () => {
    respond({
      [LAST_FM_METHODS.trackTopTags]: tagsPayload([{ name: 'gothic country', count: 60 }]),
      [LAST_FM_METHODS.artistTopTags]: tagsPayload([
        { name: 'Alt-country', count: 100 },
        { name: 'southern gothic', count: 1 },
      ]),
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels.map((label) => label.name)).toEqual([
      'Alt-country',
      'gothic country',
      'southern gothic',
    ])
  })

  it('keeps a low-count microgenre, which is the signal we are here for', async () => {
    respond({
      [LAST_FM_METHODS.trackTopTags]: tagsPayload([]),
      [LAST_FM_METHODS.artistTopTags]: tagsPayload([{ name: 'southern gothic', count: 1 }]),
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels).toEqual([{ name: 'southern gothic', weight: 1, source: 'artist' }])
  })

  it('falls back to artist tags when the track has none', async () => {
    respond({
      [LAST_FM_METHODS.trackTopTags]: tagsPayload([]),
      [LAST_FM_METHODS.artistTopTags]: tagsPayload([{ name: 'post-punk', count: 100 }]),
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels).toEqual([{ name: 'post-punk', weight: 100, source: 'artist' }])
  })

  it('marks a label found on the track as track-sourced even when the artist shares it', async () => {
    respond({
      [LAST_FM_METHODS.trackTopTags]: tagsPayload([{ name: 'dream pop', count: 40 }]),
      [LAST_FM_METHODS.artistTopTags]: tagsPayload([{ name: 'Dream Pop', count: 100 }]),
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels).toEqual([{ name: 'dream pop', weight: 100, source: 'track' }])
  })

  it('survives the track lookup failing outright', async () => {
    fetchMock.mockImplementation((url: URL) => {
      const method = new URL(url).searchParams.get('method')
      const isTrack = method === LAST_FM_METHODS.trackTopTags
      return Promise.resolve(
        jsonResponse(
          isTrack
            ? { error: 6, message: 'Track not found' }
            : tagsPayload([{ name: 'americana', count: 30 }]),
        ),
      )
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels).toEqual([{ name: 'americana', weight: 30, source: 'artist' }])
  })
})

describe('tag noise filtering', () => {
  const noisy = [
    { name: '2019', count: 90 },
    { name: '90s', count: 80 },
    { name: '2010s', count: 70 },
    { name: '-1001740215468', count: 60 },
    { name: 'WSUM 91.7 FM Madison', count: 50 },
    { name: 'Have I heard You Before with DJ T', count: 40 },
    { name: '16 Horsepower', count: 30 },
    { name: 'seen live', count: 20 },
    { name: 'favourites', count: 10 },
    { name: 'Black Soul Choir', count: 5 },
  ]

  it('drops years, decades, junk ids, stations, the artist, the track and personal tags', async () => {
    respond({
      [LAST_FM_METHODS.trackTopTags]: tagsPayload([]),
      [LAST_FM_METHODS.artistTopTags]: tagsPayload([
        ...noisy,
        { name: 'gothic americana', count: 5 },
      ]),
    })
    const { fetchLabels } = await loadLabels()

    const labels = await fetchLabels(CONTEXT)

    expect(labels.map((label) => label.name)).toEqual(['gothic americana'])
  })
})

describe('mergeLabels', () => {
  it('is case-insensitive about duplicates', async () => {
    const { mergeLabels } = await loadLabels()

    const merged = mergeLabels(
      [{ name: 'Slowcore', weight: 20, source: 'track' }],
      [{ name: 'slowcore', weight: 90, source: 'artist' }],
    )

    expect(merged).toEqual([{ name: 'Slowcore', weight: 90, source: 'track' }])
  })
})
