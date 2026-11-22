/**
 * Stores an imported database as Parquet buffers in IndexedDB.
 *
 * DuckDB-WASM cannot create an OPFS-backed database, so the database itself
 * cannot persist. A per-table Parquet snapshot can: it is roughly 3.8 MiB for a
 * 172 MB export and restores in well under a second, against ~15 s to re-parse
 * the JSON. localStorage is not an option — ~5 MB, strings only, synchronous.
 */
import { HISTORY_SCHEMA_VERSION } from '../duckdb/schema'

const DATABASE_NAME = 'spotify-history'
const STORE_NAME = 'snapshots'
const RECORD_KEY = 'latest'
const DATABASE_VERSION = 1

export interface Snapshot {
  schemaVersion: number
  createdAt: string
  tables: Record<string, Uint8Array>
}

function request<T>(pending: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pending.addEventListener('success', () => resolve(pending.result))
    pending.addEventListener('error', () =>
      reject(pending.error ?? new Error('IndexedDB request failed')),
    )
  })
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pending = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    pending.onupgradeneeded = () => {
      if (!pending.result.objectStoreNames.contains(STORE_NAME)) {
        pending.result.createObjectStore(STORE_NAME)
      }
    }
    pending.onsuccess = () => resolve(pending.result)
    pending.onerror = () => reject(pending.error ?? new Error('IndexedDB could not be opened'))
  })
}

/** Null when absent or written by a different schema version. */
export async function readSnapshot(): Promise<Snapshot | null> {
  const database = await openStore()
  try {
    const store = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const stored = await request<Snapshot | undefined>(store.get(RECORD_KEY))
    if (stored === undefined || stored.schemaVersion !== HISTORY_SCHEMA_VERSION) return null
    return stored
  } finally {
    database.close()
  }
}

export async function writeSnapshot(tables: Record<string, Uint8Array>): Promise<Snapshot> {
  const snapshot: Snapshot = {
    schemaVersion: HISTORY_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  }
  const database = await openStore()
  try {
    const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    await request(store.put(snapshot, RECORD_KEY))
    return snapshot
  } finally {
    database.close()
  }
}

export async function clearSnapshot(): Promise<void> {
  const database = await openStore()
  try {
    const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    await request(store.delete(RECORD_KEY))
  } finally {
    database.close()
  }
}

export function snapshotBytes(snapshot: Snapshot): number {
  return Object.values(snapshot.tables).reduce((total, buffer) => total + buffer.byteLength, 0)
}
