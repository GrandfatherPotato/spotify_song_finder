/**
 * SQL for moving the database in and out of per-table Parquet buffers.
 *
 * Separate from `duckdb/ingest.ts`, which loads a freshly parsed export: this
 * is the persistence path, reading back what a previous import produced.
 */
export function snapshotFileName(table: string): string {
  return `${table}.parquet`
}

export function snapshotExportSql(table: string): string {
  return `COPY ${table} TO '${snapshotFileName(table)}' (FORMAT PARQUET, COMPRESSION ZSTD)`
}

/**
 * `BY NAME` rather than positional: Parquet does not carry the `play_kind` ENUM,
 * so `kind` returns as VARCHAR and is cast back on the way in.
 */
export function snapshotRestoreSql(table: string): string {
  return `INSERT INTO ${table} BY NAME SELECT * FROM read_parquet('${snapshotFileName(table)}')`
}
