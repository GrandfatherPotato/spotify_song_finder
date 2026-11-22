import { describe, expect, it } from 'vitest'
import { snapshotExportSql, snapshotFileName, snapshotRestoreSql } from './parquet'

describe('snapshot sql', () => {
  it('writes compressed parquet per table', () => {
    expect(snapshotExportSql('plays')).toBe(
      "COPY plays TO 'plays.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)",
    )
  })

  it('restores BY NAME, since parquet loses the play_kind enum', () => {
    expect(snapshotRestoreSql('plays')).toContain('INSERT INTO plays BY NAME')
    expect(snapshotRestoreSql('plays')).toContain("read_parquet('plays.parquet')")
  })

  it('names the export and the restore file identically', () => {
    for (const table of ['artists', 'plays', 'meta']) {
      expect(snapshotExportSql(table)).toContain(snapshotFileName(table))
      expect(snapshotRestoreSql(table)).toContain(snapshotFileName(table))
    }
  })
})
