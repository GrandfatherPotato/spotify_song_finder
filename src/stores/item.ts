import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef } from 'vue'
import {
  itemSongsQuery,
  itemSummaryQuery,
  progressionQuery,
  searchQuery,
  LEADERBOARD_ENTITY,
} from '../history/duckdb/queries'
import type {
  LeaderboardRow,
  ItemSummary,
  LeaderboardEntity,
  ProgressionRow,
  SearchRow,
} from '../history/duckdb/queries'
import type { HistoryDatabase } from '../history'
import type { ItemRef } from '../history/itemRef'
import { BUCKET, bucketForSpan } from '../history/range'
import type { Bucket, TimeRange } from '../history/range'
import { useHistoryStore } from './history'

interface Loaded {
  summary: ItemSummary | null
  progression: ProgressionRow[]
  songs: LeaderboardRow[]
}

const EMPTY: Loaded = { summary: null, progression: [], songs: [] }

async function fetchSongs(
  database: HistoryDatabase,
  chosen: ItemRef,
  range: TimeRange | null,
): Promise<LeaderboardRow[]> {
  if (chosen.entity === LEADERBOARD_ENTITY.song) return []
  return database.query(itemSongsQuery(chosen, range))
}

function spanOf(summary: ItemSummary | null, range: TimeRange | null): TimeRange | null {
  if (range !== null) return range
  if (summary === null || summary.firstPlay === '') return null
  return { start: summary.firstPlay, end: summary.lastPlay }
}

function bucketFor(summary: ItemSummary | null, range: TimeRange | null): Bucket {
  const span = spanOf(summary, range)
  return span === null ? BUCKET.month : bucketForSpan(span.start, span.end)
}

export const useItemStore = defineStore('item', () => {
  const history = useHistoryStore()

  const entity = ref<LeaderboardEntity>(LEADERBOARD_ENTITY.artist)
  const selected = ref<ItemRef | null>(null)
  const range = ref<TimeRange | null>(null)

  const results = shallowRef<SearchRow[]>([])
  const busy = reactive({ searching: false, loading: false })
  const problem = ref('')
  const loaded = shallowRef<Loaded>(EMPTY)

  const latest = { search: 0, load: 0 }

  /**
   * A range picked for one item means nothing for the next, whose history may
   * not even overlap it. The search control follows the item too, so landing
   * on a song from a link leaves it looking for songs.
   */
  function select(chosen: ItemRef | null): void {
    selected.value = chosen
    range.value = null
    if (chosen !== null) entity.value = chosen.entity
  }

  async function search(fragment: string): Promise<void> {
    const database = history.database
    const request = (latest.search += 1)
    if (database === null || fragment.trim() === '') {
      results.value = []
      return
    }
    busy.searching = true
    try {
      const rows = await database.query(searchQuery(entity.value, fragment.trim()))
      if (request === latest.search) results.value = rows
    } finally {
      if (request === latest.search) busy.searching = false
    }
  }

  async function fetchInto(
    database: HistoryDatabase,
    chosen: ItemRef,
    request: number,
  ): Promise<void> {
    busy.loading = true
    problem.value = ''
    try {
      const [summary] = await database.query(itemSummaryQuery(chosen))
      const bucket = bucketFor(summary ?? null, range.value)
      const progression = await database.query(progressionQuery(chosen, range.value, bucket))
      const songs = await fetchSongs(database, chosen, range.value)
      if (request !== latest.load) return
      loaded.value = { summary: summary ?? null, progression, songs }
    } catch (error) {
      if (request !== latest.load) return
      problem.value = error instanceof Error ? error.message : String(error)
      loaded.value = EMPTY
    } finally {
      if (request === latest.load) busy.loading = false
    }
  }

  async function load(): Promise<void> {
    const database = history.database
    const chosen = selected.value
    const request = (latest.load += 1)
    if (database === null || chosen === null) {
      loaded.value = EMPTY
      return
    }
    await fetchInto(database, chosen, request)
  }

  return {
    entity,
    selected,
    range,
    results,
    problem,
    search,
    load,
    select,
    searching: computed(() => busy.searching),
    loading: computed(() => busy.loading),
    summary: computed(() => loaded.value.summary),
    progression: computed(() => loaded.value.progression),
    songs: computed(() => loaded.value.songs),
    bucket: computed(() => bucketFor(loaded.value.summary, range.value)),
  }
})
