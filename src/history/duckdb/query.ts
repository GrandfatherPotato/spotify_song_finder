/**
 * Pairs a statement with a schema for the rows it returns.
 *
 * DuckDB hands back `Record<string, unknown>`, and asserting a shape onto that
 * is where silent corruption starts: `count(*)` arrives as a bigint, `round()`
 * as a double, and a renamed column as `undefined`. Parsing instead means a
 * drifted query fails at the boundary rather than rendering a plausible zero.
 */
import type { z } from 'zod'

export interface NamedQuery<Row> {
  sql: string
  row: z.ZodType<Row>
}

export function defineQuery<Row>(sql: string, row: z.ZodType<Row>): NamedQuery<Row> {
  return { sql, row }
}
