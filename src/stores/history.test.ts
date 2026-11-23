import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearHistoryStorage, hasStoredSnapshot, openHistoryDatabase } from '../history'
import { deferred } from '../test-support/deferred'
import { stubHistoryDatabase } from '../test-support/history'
import { useHistoryStore } from './history'

vi.mock('../history', () => ({
  openHistoryDatabase: vi.fn(),
  hasStoredSnapshot: vi.fn(),
  clearHistoryStorage: vi.fn(),
}))

const openMock = vi.mocked(openHistoryDatabase)
const hasStoredSnapshotMock = vi.mocked(hasStoredSnapshot)

const SOURCE = { label: 'My Export', listFiles: async () => [] }

function stubDatabase() {
  const database = stubHistoryDatabase()
  openMock.mockResolvedValue(database)
  return database
}

afterEach(() => {
  vi.resetAllMocks()
})

describe('useHistoryStore', () => {
  it('opens the export once however many views ask for it in the same tick', async () => {
    stubDatabase()
    const history = useHistoryStore()

    await Promise.all([history.open(SOURCE), history.open(SOURCE)])

    expect(openMock).toHaveBeenCalledOnce()
  })

  it('holds the open database so a later visit skips the import', async () => {
    const database = stubDatabase()
    const history = useHistoryStore()

    await history.open(SOURCE)
    await history.open(SOURCE)

    expect(openMock).toHaveBeenCalledOnce()
    expect(history.database).toBe(database)
  })

  it('lets a failed import be retried rather than caching the failure', async () => {
    openMock.mockRejectedValueOnce(new Error('Manifest unavailable: 404'))
    const history = useHistoryStore()

    await expect(history.open(SOURCE)).rejects.toThrow('Manifest unavailable: 404')
    stubDatabase()
    await history.open(SOURCE)

    expect(openMock).toHaveBeenCalledTimes(2)
    expect(history.database).not.toBeNull()
  })

  it('counts an open database as stored without reading the snapshot', async () => {
    stubDatabase()
    const history = useHistoryStore()
    await history.open(SOURCE)

    expect(await history.isStored()).toBe(true)
    expect(hasStoredSnapshotMock).not.toHaveBeenCalled()
  })

  it('falls back to the saved snapshot when nothing is open yet', async () => {
    hasStoredSnapshotMock.mockResolvedValue(true)
    const history = useHistoryStore()

    expect(await history.isStored()).toBe(true)
  })

  it('hands the open database to the clear, so its file locks are released first', async () => {
    const database = stubDatabase()
    const history = useHistoryStore()
    await history.open(SOURCE)

    await history.reset()

    expect(vi.mocked(clearHistoryStorage)).toHaveBeenCalledWith(database)
    expect(history.database).toBeNull()
  })

  it('closes a database that was still opening when the clear arrived', async () => {
    const database = stubHistoryDatabase()
    const opening = deferred<typeof database>()
    openMock.mockReturnValue(opening.promise)
    const history = useHistoryStore()
    const open = history.open(SOURCE)

    const reset = history.reset()
    opening.resolve(database)
    await Promise.all([open, reset])

    expect(vi.mocked(clearHistoryStorage)).toHaveBeenCalledWith(database)
    expect(history.database).toBeNull()
  })

  it('reopens after a reset rather than handing back the database it closed', async () => {
    stubDatabase()
    const history = useHistoryStore()
    await history.open(SOURCE)
    await history.reset()

    await history.open(SOURCE)

    expect(openMock).toHaveBeenCalledTimes(2)
  })
})
