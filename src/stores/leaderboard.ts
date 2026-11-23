import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import {
  DEFAULT_LEADERBOARD_SIZE,
  LEADERBOARD_ENTITY,
  leaderboardQuery,
  trendQuery,
} from '../history/duckdb/queries'
import type {
  LeaderboardEntity,
  LeaderboardRow,
  LeaderboardSize,
  TrendRow,
} from '../history/duckdb/queries'
import type { HistoryDatabase } from '../history'
import { rangeKey } from '../history/range'
import type { TimeRange } from '../history/range'
import { useHistoryStore } from './history'

interface Loaded {
  board: LeaderboardRow[]
  trend: TrendRow[]
}

const EMPTY: Loaded = { board: [], trend: [] }

function selectionKey(entity: LeaderboardEntity, range: TimeRange | null): string {
  return `${entity}:${rangeKey(range)}`
}

async function fetchSelection(
  database: HistoryDatabase,
  entity: LeaderboardEntity,
  range: TimeRange | null,
): Promise<Loaded> {
  const [board, trend] = await Promise.all([
    database.query(leaderboardQuery(entity, range)),
    database.query(trendQuery(entity, range)),
  ])
  return { board, trend }
}

export const useLeaderboardStore = defineStore('leaderboard', () => {
  const history = useHistoryStore()

  const entity = ref<LeaderboardEntity>(LEADERBOARD_ENTITY.artist)
  const size = ref<LeaderboardSize>(DEFAULT_LEADERBOARD_SIZE)
  const range = ref<TimeRange | null>(null)

  const loading = ref(false)
  const problem = ref('')
  const loaded = shallowRef<Loaded>(EMPTY)

  const cache = new Map<string, Loaded>()

  const ranked = computed(() => loaded.value.board.slice(0, size.value))
  const charted = computed(() => loaded.value.trend)

  // A re-import rebuilds every table, so results cached against the old
  // database describe listening that is no longer what is stored.
  watch(
    () => history.database,
    () => {
      cache.clear()
      loaded.value = EMPTY
    },
  )

  let latest = 0

  async function fetchInto(database: HistoryDatabase, key: string, request: number): Promise<void> {
    loading.value = true
    problem.value = ''
    try {
      const fresh = await fetchSelection(database, entity.value, range.value)
      cache.set(key, fresh)
      if (request === latest) loaded.value = fresh
    } catch (error) {
      if (request !== latest) return
      problem.value = error instanceof Error ? error.message : String(error)
      loaded.value = EMPTY
    } finally {
      if (request === latest) loading.value = false
    }
  }

  async function load(): Promise<void> {
    const database = history.database
    if (database === null) return
    const request = (latest += 1)
    const key = selectionKey(entity.value, range.value)
    const hit = cache.get(key)
    if (hit !== undefined) {
      problem.value = ''
      loaded.value = hit
      return
    }
    await fetchInto(database, key, request)
  }

  return { entity, size, range, loading, problem, ranked, charted, load }
})
