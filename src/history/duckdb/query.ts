/**
 * Pairs a statement with a schema for the rows it returns.
 *
 * DuckDB hands back `Record<string, unknown>`, and asserting a shape onto that
 * is where silent corruption starts: `count(*)` arrives as a bigint, `round()`
 * as a double, and a renamed column as `undefined`. Parsing instead means a
 * drifted query fails at the boundary rather than rendering a plausible zero.
 */
import type { z } from 'zod'

export interface NamedQuery<Row, Params extends readonly unknown[] = []> {
  sql: string
  row: z.ZodType<Row>
  /** What the query console binds, since it runs every query without knowing any of their shapes. */
  defaultParams?: Params
}

export function defineQuery<Row, Params extends readonly unknown[] = []>(
  sql: string,
  row: z.ZodType<Row>,
  defaultParams?: Params,
): NamedQuery<Row, Params> {
  return { sql, row, defaultParams }
}

/**
 * A clause and the values it binds, together: in two parallel arrays, adding a
 * filter would shift every later `?` and bind the right values to the wrong
 * placeholders.
 */
export interface SqlFilter {
  clause: string
  params: readonly unknown[]
}

export interface ComposedWhere {
  where: string
  params: readonly unknown[]
}

export function composeWhere(base: string, filters: readonly SqlFilter[]): ComposedWhere {
  return {
    where: [base, ...filters.map((filter) => filter.clause)].join(' AND '),
    params: filters.flatMap((filter) => [...filter.params]),
  }
}
