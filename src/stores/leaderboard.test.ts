import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HistoryDatabase } from '../history'
import { LEADERBOARD_ENTITY } from '../history/duckdb/queries'
import { yearRange } from '../history/range'
import { deferred } from '../test-support/deferred'
import { stubHistoryDatabase } from '../test-support/history'
import { useHistoryStore } from './history'
import { useLeaderboardStore } from './leaderboard'

vi.mock('../history', () => ({
  openHistoryDatabase: vi.fn(),
  hasStoredSnapshot: vi.fn(),
  clearHistoryStorage: vi.fn(),
}))

const BOARD = [
  { id: 1, name: 'Radiohead', subtitle: null, plays: 1284, hours: 87.2 },
  { id: 2, name: 'Bonobo', subtitle: null, plays: 976, hours: 71.9 },
  { id: 3, name: 'Burial', subtitle: null, plays: 512, hours: 38.8 },
]

const TREND = [{ month: '2024-01-01', id: 1, hours: 4 }]

function openWith(query: HistoryDatabase['query']) {
  useHistoryStore().database = stubHistoryDatabase({ query })
  return useLeaderboardStore()
}

function stubQuery(pairs = 1) {
  const query = vi.fn().mockResolvedValueOnce(BOARD).mockResolvedValueOnce(TREND)
  for (let pair = 1; pair < pairs; pair += 1) {
    query.mockResolvedValueOnce(BOARD).mockResolvedValueOnce(TREND)
  }
  return query
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('useLeaderboardStore', () => {
  it('loads the board and the trend together', async () => {
    const leaderboard = openWith(stubQuery())

    await leaderboard.load()

    expect(leaderboard.ranked).toEqual(BOARD)
    expect(leaderboard.charted).toEqual(TREND)
  })

  it('slices to the chosen size rather than running another query', async () => {
    const query = stubQuery()
    const leaderboard = openWith(query)
    await leaderboard.load()

    leaderboard.size = 3

    expect(leaderboard.ranked).toHaveLength(3)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('answers a selection it has already loaded from cache', async () => {
    const query = stubQuery()
    const leaderboard = openWith(query)

    await leaderboard.load()
    await leaderboard.load()

    expect(query).toHaveBeenCalledTimes(2)
  })

  it('queries again when the range changes, since that is a different aggregate', async () => {
    const query = stubQuery(2)
    const leaderboard = openWith(query)
    await leaderboard.load()

    leaderboard.range = yearRange(2024)
    await leaderboard.load()

    expect(query).toHaveBeenCalledTimes(4)
  })

  it('keeps the entity and the range apart in the cache', async () => {
    const query = stubQuery(2)
    const leaderboard = openWith(query)
    await leaderboard.load()

    leaderboard.entity = LEADERBOARD_ENTITY.album
    await leaderboard.load()

    expect(query).toHaveBeenCalledTimes(4)
  })

  it('surfaces a failed query instead of showing the previous answer', async () => {
    const leaderboard = openWith(
      vi.fn().mockRejectedValue(new Error('Binder Error: no such column')),
    )

    await leaderboard.load()

    expect(leaderboard.problem).toBe('Binder Error: no such column')
    expect(leaderboard.ranked).toEqual([])
    expect(leaderboard.loading).toBe(false)
  })

  it('forgets everything cached when a re-import replaces the database', async () => {
    const leaderboard = openWith(stubQuery())
    await leaderboard.load()

    useHistoryStore().database = stubHistoryDatabase({ query: stubQuery() })
    await nextTick()

    expect(leaderboard.ranked).toEqual([])
  })

  it('ignores a slower earlier selection that lands after a newer one', async () => {
    const ALBUMS = [{ id: 9, name: 'Kid A', subtitle: 'Radiohead', plays: 1, hours: 1 }]
    const slowArtists = deferred<unknown>()
    const query = vi
      .fn()
      .mockReturnValueOnce(slowArtists.promise)
      .mockReturnValueOnce(slowArtists.promise)
      .mockResolvedValueOnce(ALBUMS)
      .mockResolvedValueOnce(TREND)
    const leaderboard = openWith(query)

    const artists = leaderboard.load()
    leaderboard.entity = LEADERBOARD_ENTITY.album
    await leaderboard.load()
    slowArtists.resolve(BOARD)
    await artists

    expect(leaderboard.ranked).toEqual(ALBUMS)
    expect(leaderboard.loading).toBe(false)
  })

  it('clears a stale error when a cached selection is restored', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(BOARD)
      .mockResolvedValueOnce(TREND)
      .mockRejectedValue(new Error('Binder Error: no such column'))
    const leaderboard = openWith(query)
    await leaderboard.load()

    leaderboard.entity = LEADERBOARD_ENTITY.album
    await leaderboard.load()
    expect(leaderboard.problem).not.toBe('')

    leaderboard.entity = LEADERBOARD_ENTITY.artist
    await leaderboard.load()

    expect(leaderboard.problem).toBe('')
    expect(leaderboard.ranked).toEqual(BOARD)
  })

  it('does nothing at all when no database is open', async () => {
    const leaderboard = useLeaderboardStore()

    await leaderboard.load()

    expect(leaderboard.ranked).toEqual([])
    expect(leaderboard.problem).toBe('')
  })
})
