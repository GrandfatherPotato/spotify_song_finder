/**
 * Boots DuckDB-WASM and hands back a connection that has proved it answers
 * queries. Knows nothing about the streaming-history schema.
 */
import * as duckdb from '@duckdb/duckdb-wasm'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import { splitStatements } from './ingest'

export const OPFS_FILE_NAME = 'spotify-history.db'

export const OPFS_FILE_NAMES = [OPFS_FILE_NAME, `${OPFS_FILE_NAME}.wal`]

/**
 * Deliberately `opfs:/` with one slash, not the `opfs://` the docs show.
 *
 * duckdb-wasm cannot create a new OPFS database. Passing `opfs://…` makes its
 * worker prepare handles keyed by that literal string, but it only registers
 * one when `handle.getSize()` is already non-zero — never true for a database
 * it just created. The fallback promotion in `getFileInfo` misses too, because
 * DuckDB normalises the name to a single slash. Writes then land in the
 * in-memory filesystem and the file stays 0 bytes forever, which is
 * self-perpetuating. Registering the handles ourselves sidesteps both.
 *
 * Verified identical in 1.32.0 (core v1.4.3) and 1.33.1-dev57.0 (core v1.5.4).
 * On 1.32.0 the `opfs` extension does not exist at all, so this always falls
 * back to memory; cross-session persistence comes from the snapshot instead.
 */
const OPFS_DB_PATH = `opfs:/${OPFS_FILE_NAME}`

export const HEALTH_CHECK_SQL = 'SELECT 1 AS ok'

export const STORAGE = {
  opfs: 'OPFS (persisted)',
  memory: 'in-memory (not persisted)',
} as const

export type Storage = (typeof STORAGE)[keyof typeof STORAGE]

export type QueryRows = Array<Record<string, unknown>>

export interface OpenedDatabase {
  db: duckdb.AsyncDuckDB
  conn: duckdb.AsyncDuckDBConnection
  storage: Storage
}

/** What DuckDB itself believes it opened, as opposed to what it was asked for. */
const DIAGNOSTIC_SQL = {
  databases: 'SELECT database_name, path, type FROM duckdb_databases()',
  size: 'PRAGMA database_size',
}

const BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
}

export function toRows(table: { toArray: () => unknown[] }): QueryRows {
  return table.toArray().map((row) => {
    const plain = (row as { toJSON: () => Record<string, unknown> }).toJSON()
    return Object.fromEntries(
      Object.entries(plain).map(([key, value]) => [
        key,
        typeof value === 'bigint' ? Number(value) : value,
      ]),
    )
  })
}

export async function runStatements(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
): Promise<void> {
  for (const statement of splitStatements(sql)) await conn.query(statement)
}

async function instantiate(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(BUNDLES)
  if (bundle.mainWorker === null) throw new Error('No DuckDB-WASM worker bundle is available')
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(bundle.mainWorker))
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  return db
}

/**
 * `open()` resolving proves only that a handle was created — OPFS can fail on
 * first real I/O instead. Connecting and running a trivial SELECT is what
 * proves the database answers queries at all.
 */
async function connectAndProbe(db: duckdb.AsyncDuckDB): Promise<duckdb.AsyncDuckDBConnection> {
  const conn = await db.connect()
  try {
    const rows = toRows(await conn.query(HEALTH_CHECK_SQL))
    if (rows[0]?.ok !== 1) throw new Error('DuckDB answered a trivial SELECT incorrectly')
    return conn
  } catch (error) {
    await conn.close()
    throw error
  }
}

/** DuckDB opens the database and its write-ahead log; both need a handle. */
async function registerOpfsHandles(db: duckdb.AsyncDuckDB): Promise<void> {
  const root = await navigator.storage.getDirectory()
  for (const name of OPFS_FILE_NAMES) {
    const handle = await root.getFileHandle(name, { create: true })
    await db.registerFileHandle(
      `opfs:/${name}`,
      handle,
      duckdb.DuckDBDataProtocol.BROWSER_FSACCESS,
      true,
    )
  }
}

/** Falls back to an in-memory database so a browser without OPFS still works. */
export async function openDatabase(): Promise<OpenedDatabase> {
  const db = await instantiate()
  try {
    await registerOpfsHandles(db)
    await db.open({
      path: OPFS_DB_PATH,
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
      useDirectIO: true,
    })
    return { db, storage: STORAGE.opfs, conn: await connectAndProbe(db) }
  } catch {
    await db.open({})
    return { db, storage: STORAGE.memory, conn: await connectAndProbe(db) }
  }
}

export async function collectDiagnostics(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
): Promise<string> {
  const parts = [`duckdb ${await db.getVersion()}`]
  for (const [label, sql] of Object.entries(DIAGNOSTIC_SQL)) {
    try {
      parts.push(`${label}: ${JSON.stringify(toRows(await conn.query(sql)))}`)
    } catch (error) {
      parts.push(`${label}: failed (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  return parts.join(' · ')
}
