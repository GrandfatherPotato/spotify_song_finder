/**
 * Derived figures for the overview, on top of the parsed `totals` row.
 *
 * The row's own shape and validation live with its SQL in `duckdb/queries.ts`:
 * `TOTALS_QUERY` parses into `HistorySummary`, so nothing here re-describes
 * what the database returns.
 */
export type { HistorySummary } from './duckdb/queries'
import type { HistorySummary } from './duckdb/queries'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** Whole years between the first and last play, for "N years of listening". */
export function yearsSpanned(summary: HistorySummary): number {
  const first = Date.parse(`${summary.firstPlay}T00:00:00Z`)
  const last = Date.parse(`${summary.lastPlay}T00:00:00Z`)
  if (Number.isNaN(first) || Number.isNaN(last)) return 0
  return Math.max(1, Math.round((last - first) / MS_PER_YEAR))
}
