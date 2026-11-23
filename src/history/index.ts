/**
 * Orchestrates the three layers: read an export, load it into DuckDB, and keep
 * a Parquet snapshot so the next page load skips the import.
 */
import type * as duckdb from '@duckdb/duckdb-wasm'
import { HistoryTableBuilder } from './export/tables'
import type { ExportSource } from './export/source'
import type { StreamingHistoryEntry } from './export/tables'
import {
  OPFS_FILE_NAMES,
  STORAGE,
  collectDiagnostics,
  openDatabase,
  runStatements,
  toRows,
} from './duckdb/client'
import type { QueryRows, Storage } from './duckdb/client'
import { metaInsertSql, tableLoads, toNdjson } from './duckdb/ingest'
import {
  HISTORY_RESET_SQL,
  HISTORY_SCHEMA_SQL,
  HISTORY_SCHEMA_VERSION,
  HISTORY_TABLES,
} from './duckdb/schema'
import type { NamedQuery } from './duckdb/query'
import { removeOpfsFiles } from './opfs'
import { snapshotExportSql, snapshotFileName, snapshotRestoreSql } from './snapshot/parquet'
import { clearSnapshot, readSnapshot, snapshotBytes, writeSnapshot } from './snapshot/store'
import type { Snapshot } from './snapshot/store'

export type { QueryRows, Storage } from './duckdb/client'

const BYTES_PER_MB = 1024 * 1024

export interface ImportProgress {
  message: string
  completed: number
  total: number
}

export interface HistoryDatabase {
  storage: Storage
  origin: string
  diagnostics: string
  /** Typed and validated. Prefer this wherever the shape is known up front. */
  query: <Row, Params extends readonly unknown[]>(
    named: NamedQuery<Row, Params>,
    ...params: Params
  ) => Promise<Row[]>
  /** Untyped escape hatch, for the test page and ad-hoc SQL. */
  runQuery: (sql: string) => Promise<QueryRows>
  close: () => Promise<void>
}

type ProgressHandler = (progress: ImportProgress) => void

interface ExistingImport {
  reused: boolean
  reason: string
}

const META_TABLE_SQL = `
  SELECT count(*) AS present FROM duckdb_tables() WHERE table_name = 'meta'
`

async function inspectExistingImport(
  conn: duckdb.AsyncDuckDBConnection,
  storage: Storage,
): Promise<ExistingImport> {
  if (storage === STORAGE.memory) {
    return { reused: false, reason: 'a fresh in-memory database holds nothing' }
  }
  try {
    const [found] = toRows(await conn.query(META_TABLE_SQL))
    if (found?.present !== 1) return { reused: false, reason: 'no import found in storage' }
    const [meta] = toRows(await conn.query('SELECT schema_version FROM meta'))
    if (meta?.schema_version === HISTORY_SCHEMA_VERSION) {
      return { reused: true, reason: 'schema version matches' }
    }
    return { reused: false, reason: `meta.schema_version was ${String(meta?.schema_version)}` }
  } catch (error) {
    return { reused: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** A silent insert failure would otherwise surface much later as wrong stats. */
async function verifyRowCount(conn: duckdb.AsyncDuckDBConnection, expected: number): Promise<void> {
  const rows = toRows(await conn.query('SELECT count(*) AS plays FROM plays'))
  const actual = rows[0]?.plays
  if (actual !== expected) {
    throw new Error(`Built ${expected} plays but the database holds ${String(actual)}`)
  }
}

async function buildTables(
  source: ExportSource,
  onProgress: ProgressHandler,
): Promise<{ builder: HistoryTableBuilder; names: string[] }> {
  const files = await source.listFiles()
  if (files.length === 0) throw new Error(`No Streaming_History_*.json files in ${source.label}`)
  const builder = new HistoryTableBuilder()
  for (const [index, file] of files.entries()) {
    onProgress({ message: `Reading ${file.name}`, completed: index, total: files.length })
    // Each parsed array falls out of scope before the next file is read.
    builder.addFile(JSON.parse(await file.readText()) as StreamingHistoryEntry[])
  }
  return { builder, names: files.map((file) => file.name) }
}

async function importExport(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  source: ExportSource,
  onProgress: ProgressHandler,
): Promise<void> {
  const { builder, names } = await buildTables(source, onProgress)
  const tables = builder.finish()
  await runStatements(conn, `${HISTORY_RESET_SQL}${HISTORY_SCHEMA_SQL}`)
  const loads = tableLoads(tables)
  for (const [index, load] of loads.entries()) {
    onProgress({ message: `Loading ${load.table}`, completed: index, total: loads.length })
    await db.registerFileText(load.file, toNdjson(load.rows))
    await conn.query(load.insertSql)
    await db.dropFile(load.file)
  }
  await conn.query(
    metaInsertSql(HISTORY_SCHEMA_VERSION, names, {
      malformed: tables.malformed,
      renamedTracks: tables.renamedTracks,
      reattributedTracks: tables.reattributedTracks,
    }),
  )
  await verifyRowCount(conn, tables.plays.length)
}

async function exportSnapshotTables(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
): Promise<Record<string, Uint8Array>> {
  const tables: Record<string, Uint8Array> = {}
  for (const table of HISTORY_TABLES) {
    await conn.query(snapshotExportSql(table))
    tables[table] = await db.copyFileToBuffer(snapshotFileName(table))
    await db.dropFile(snapshotFileName(table))
  }
  return tables
}

async function restoreFromSnapshot(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  snapshot: Snapshot,
): Promise<void> {
  await runStatements(conn, `${HISTORY_RESET_SQL}${HISTORY_SCHEMA_SQL}`)
  for (const table of HISTORY_TABLES) {
    const buffer = snapshot.tables[table]
    if (buffer === undefined) throw new Error(`Snapshot has no ${table} table`)
    await db.registerFileBuffer(snapshotFileName(table), buffer)
    await conn.query(snapshotRestoreSql(table))
    await db.dropFile(snapshotFileName(table))
  }
}

/** A snapshot is an optimisation; never let losing one fail the import. */
async function trySaveSnapshot(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
): Promise<string> {
  try {
    const snapshot = await writeSnapshot(await exportSnapshotTables(db, conn))
    return `saved ${(snapshotBytes(snapshot) / BYTES_PER_MB).toFixed(1)} MiB snapshot`
  } catch (error) {
    return `snapshot not saved (${error instanceof Error ? error.message : String(error)})`
  }
}

async function tryReadSnapshot(): Promise<Snapshot | null> {
  try {
    return await readSnapshot()
  } catch {
    return null
  }
}

/** Cheapest source first: live database, then saved snapshot, then a full import. */
async function loadData(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  storage: Storage,
  source: ExportSource,
  onProgress: ProgressHandler,
): Promise<string> {
  const existing = await inspectExistingImport(conn, storage)
  if (existing.reused) return 'existing database'
  const snapshot = await tryReadSnapshot()
  if (snapshot !== null) {
    onProgress({ message: 'Restoring saved snapshot', completed: 0, total: 1 })
    await restoreFromSnapshot(db, conn, snapshot)
    return `snapshot saved ${snapshot.createdAt}`
  }
  await importExport(db, conn, source, onProgress)
  onProgress({ message: 'Saving snapshot', completed: 0, total: 1 })
  return `${source.label} — ${await trySaveSnapshot(db, conn)}`
}

export async function openHistoryDatabase(
  source: ExportSource,
  onProgress: ProgressHandler,
): Promise<HistoryDatabase> {
  const { db, conn, storage } = await openDatabase()
  try {
    return await describeDatabase(db, conn, storage, source, onProgress)
  } catch (error) {
    // Without this every failed import strands a worker and its WASM instance.
    try {
      await conn.close()
      await db.terminate()
    } catch {
      // The original failure is the one worth reporting.
    }
    throw error
  }
}

/**
 * A statement with arguments goes through `prepare`, so the range the user
 * picked is bound rather than pasted into SQL. Everything else takes the
 * cheaper direct path.
 */
async function runNamed(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
  params: readonly unknown[],
): Promise<QueryRows> {
  if (params.length === 0) return toRows(await conn.query(sql))
  const statement = await conn.prepare(sql)
  try {
    return toRows(await statement.query(...params))
  } finally {
    await statement.close()
  }
}

async function describeDatabase(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  storage: Storage,
  source: ExportSource,
  onProgress: ProgressHandler,
): Promise<HistoryDatabase> {
  return {
    storage,
    origin: await loadData(db, conn, storage, source, onProgress),
    diagnostics: await collectDiagnostics(db, conn),
    query: async <Row, Params extends readonly unknown[]>(
      named: NamedQuery<Row, Params>,
      ...params: Params
    ): Promise<Row[]> =>
      named.row
        .array()
        .parse(
          await runNamed(conn, named.sql, params.length > 0 ? params : (named.defaultParams ?? [])),
        ),
    runQuery: async (sql: string) => toRows(await conn.query(sql)),
    close: async () => {
      await conn.close()
      await db.terminate()
    },
  }
}

/**
 * Whether a previous import can be reopened without asking for the export
 * again: a snapshot written by a compatible schema version is waiting in
 * IndexedDB. Whether this page load already holds an open database is the
 * store's question, not this module's.
 */
export async function hasStoredSnapshot(): Promise<boolean> {
  return (await tryReadSnapshot()) !== null
}

/**
 * Discards everything an import produced: the saved snapshot, the stale OPFS
 * files and the open database. The next open starts from the export again.
 */
export async function clearHistoryStorage(database: HistoryDatabase | null): Promise<void> {
  await clearSnapshot()
  // Close first: DuckDB holds exclusive sync access handles on the OPFS files,
  // so removing them while the worker lives fails silently and leaves them.
  if (database !== null) {
    try {
      await database.close()
    } catch {
      // A database that never opened has nothing to close.
    }
  }
  await removeOpfsFiles(OPFS_FILE_NAMES)
}
