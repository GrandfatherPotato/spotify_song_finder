import { vi } from 'vitest'
import type { HistoryDatabase } from '../history'
import { STORAGE } from '../history/duckdb/client'

export function stubHistoryDatabase(overrides: Partial<HistoryDatabase> = {}): HistoryDatabase {
  return {
    storage: STORAGE.memory,
    origin: 'My Export',
    diagnostics: 'duckdb test',
    query: vi.fn(),
    runQuery: vi.fn(),
    close: vi.fn(),
    ...overrides,
  }
}
