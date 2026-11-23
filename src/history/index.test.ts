import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { z } from 'zod'
import { STORAGE, openDatabase, toRows } from './duckdb/client'
import { defineQuery } from './duckdb/query'
import { HISTORY_SCHEMA_VERSION, HISTORY_TABLES } from './duckdb/schema'
import { removeOpfsFiles } from './opfs'
import { readSnapshot } from './snapshot/store'
import { clearHistoryStorage, openHistoryDatabase } from './index'

vi.mock('./duckdb/client', async (importOriginal) => {
  const actual = await importOriginal<object>()
  return {
    ...actual,
    openDatabase: vi.fn(),
    collectDiagnostics: vi.fn().mockResolvedValue('duckdb test'),
    runStatements: vi.fn(),
    toRows: vi.fn().mockReturnValue([]),
  }
})
vi.mock('./snapshot/store', () => ({
  readSnapshot: vi.fn(),
  writeSnapshot: vi.fn(),
  clearSnapshot: vi.fn(),
  snapshotBytes: vi.fn().mockReturnValue(0),
}))
vi.mock('./opfs', () => ({ removeOpfsFiles: vi.fn(), describeOpfsRoot: vi.fn() }))

const openDatabaseMock = vi.mocked(openDatabase)
const readSnapshotMock = vi.mocked(readSnapshot)

/** Every call that matters for ordering, in the order it happened. */
let calls: string[] = []

function stubDatabase() {
  const conn = {
    query: vi.fn(),
    prepare: vi.fn(),
    close: vi.fn(() => {
      calls.push('conn.close')
    }),
  }
  const db = {
    registerFileBuffer: vi.fn(),
    registerFileText: vi.fn(),
    dropFile: vi.fn(),
    copyFileToBuffer: vi.fn(),
    terminate: vi.fn(() => {
      calls.push('db.terminate')
    }),
  }
  openDatabaseMock.mockResolvedValue({
    db,
    conn,
    storage: STORAGE.memory,
  } as unknown as Awaited<ReturnType<typeof openDatabase>>)
  return { db, conn }
}

function storedSnapshot() {
  return {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    createdAt: '2026-11-22T00:00:00.000Z',
    tables: Object.fromEntries(HISTORY_TABLES.map((table) => [table, new Uint8Array()])),
  }
}

const EMPTY_SOURCE = { label: 'nothing', listFiles: async () => [] }

beforeEach(() => {
  calls = []
  vi.mocked(removeOpfsFiles).mockImplementation(async () => {
    calls.push('removeOpfsFiles')
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('openHistoryDatabase', () => {
  it('closes the database when the import fails, instead of stranding its worker', async () => {
    const { db, conn } = stubDatabase()
    readSnapshotMock.mockResolvedValue(null)

    await expect(openHistoryDatabase(EMPTY_SOURCE, vi.fn())).rejects.toThrow(
      'No Streaming_History_*.json files in nothing',
    )

    expect(conn.close).toHaveBeenCalledOnce()
    expect(db.terminate).toHaveBeenCalledOnce()
  })

  it('leaves the database open when the import succeeds', async () => {
    const { db, conn } = stubDatabase()
    readSnapshotMock.mockResolvedValue(storedSnapshot())

    await openHistoryDatabase(EMPTY_SOURCE, vi.fn())

    expect(conn.close).not.toHaveBeenCalled()
    expect(db.terminate).not.toHaveBeenCalled()
  })
})

describe('query', () => {
  const RANGE_QUERY = defineQuery(
    'SELECT count(*) AS plays FROM plays WHERE ts >= CAST(? AS TIMESTAMP)',
    z.object({ plays: z.number() }),
    ['1970-01-01'],
  )
  const COUNT_QUERY = defineQuery(
    'SELECT count(*) AS plays FROM plays',
    z.object({ plays: z.number() }),
  )

  async function openWithRows(rows: Array<Record<string, unknown>>) {
    const { conn } = stubDatabase()
    readSnapshotMock.mockResolvedValue(storedSnapshot())
    const database = await openHistoryDatabase(EMPTY_SOURCE, vi.fn())
    vi.mocked(toRows).mockReturnValue(rows)
    return { conn, database }
  }

  it('binds arguments through a prepared statement rather than pasting them into the SQL', async () => {
    const { conn, database } = await openWithRows([{ plays: 7 }])
    const statement = { query: vi.fn(), close: vi.fn() }
    conn.prepare.mockResolvedValue(statement)

    const rows = await database.query(RANGE_QUERY, '2024-01-01')

    expect(conn.prepare).toHaveBeenCalledWith(RANGE_QUERY.sql)
    expect(statement.query).toHaveBeenCalledWith('2024-01-01')
    expect(rows).toEqual([{ plays: 7 }])
  })

  it('closes the prepared statement even when the query throws', async () => {
    const { conn, database } = await openWithRows([])
    const statement = {
      query: vi.fn().mockRejectedValue(new Error('Binder Error: no such column')),
      close: vi.fn(),
    }
    conn.prepare.mockResolvedValue(statement)

    await expect(database.query(RANGE_QUERY, '2024-01-01')).rejects.toThrow('Binder Error')

    expect(statement.close).toHaveBeenCalledOnce()
  })

  it('takes the direct path when a statement has no arguments to bind', async () => {
    const { conn, database } = await openWithRows([{ plays: 3 }])

    await database.query(COUNT_QUERY)

    expect(conn.prepare).not.toHaveBeenCalled()
    expect(conn.query).toHaveBeenCalledWith(COUNT_QUERY.sql)
  })
})

describe('clearHistoryStorage', () => {
  it('closes the database before removing the OPFS files it holds locked', async () => {
    stubDatabase()
    readSnapshotMock.mockResolvedValue(storedSnapshot())
    const database = await openHistoryDatabase(EMPTY_SOURCE, vi.fn())

    await clearHistoryStorage(database)

    expect(calls).toEqual(['conn.close', 'db.terminate', 'removeOpfsFiles'])
  })

  it('still removes the files when no database was ever opened', async () => {
    await clearHistoryStorage(null)

    expect(calls).toEqual(['removeOpfsFiles'])
  })
})
