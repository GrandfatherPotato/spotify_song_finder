import { describe, expect, it } from 'vitest'
import { HISTORY_RESET_SQL, HISTORY_SCHEMA_SQL } from './schema'
import { PLAY_KIND } from '../export/tables'

const ENRICHMENT_TABLE = 'artist_enrichment'

function createdTables(sql: string): string[] {
  return [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g)].map((match) => match[1])
}

function droppedTables(sql: string): string[] {
  return [...sql.matchAll(/DROP TABLE IF EXISTS (\w+)/g)].map((match) => match[1])
}

describe('reset and schema', () => {
  it('drops every table it creates, so a re-import rebuilds from scratch', () => {
    const rebuilt = createdTables(HISTORY_SCHEMA_SQL).filter((name) => name !== ENRICHMENT_TABLE)

    expect(rebuilt.length).toBeGreaterThan(0)
    expect(droppedTables(HISTORY_RESET_SQL).sort()).toEqual(rebuilt.sort())
  })

  it('never drops artist_enrichment, which a re-import must preserve', () => {
    expect(droppedTables(HISTORY_RESET_SQL)).not.toContain(ENRICHMENT_TABLE)
  })

  it('creates artist_enrichment defensively so a second import does not fail', () => {
    expect(HISTORY_SCHEMA_SQL).toContain(`CREATE TABLE IF NOT EXISTS ${ENRICHMENT_TABLE}`)
  })

  it('drops the plays table before the enum its column depends on', () => {
    expect(HISTORY_RESET_SQL.indexOf('DROP TABLE IF EXISTS plays')).toBeLessThan(
      HISTORY_RESET_SQL.indexOf('DROP TYPE IF EXISTS play_kind'),
    )
  })

  it('declares the enum from the same values the parser assigns', () => {
    const values = Object.values(PLAY_KIND)
      .map((kind) => `'${kind}'`)
      .join(', ')

    expect(HISTORY_SCHEMA_SQL).toContain(`CREATE TYPE play_kind AS ENUM (${values})`)
  })
})
