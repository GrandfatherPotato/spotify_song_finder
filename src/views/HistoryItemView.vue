<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BackLink from '../components/common/BackLink.vue'
import HistoryLeaderboardTable from '../components/HistoryLeaderboardTable.vue'
import SkeletonBlock from '../components/common/SkeletonBlock.vue'
import StatTile from '../components/common/StatTile.vue'
import type { StatTileProps } from '../components/common/StatTile.vue'
import HistoryItemSearch from '../components/HistoryItemSearch.vue'
import HistoryProgressionChart from '../components/HistoryProgressionChart.vue'
import HistoryRangePicker from '../components/HistoryRangePicker.vue'
import SegmentedControl from '../components/common/SegmentedControl.vue'
import HistoryAlbumGroups from '../components/HistoryAlbumGroups.vue'
import { HISTORY_STATUS, useHistoryDatabase } from '../composables/useHistoryDatabase'
import { LATEST_ALBUM_CAVEAT, MIN_PLAY_CAVEAT } from '../history/caveats'
import { formatCount, formatDate, formatHours } from '../history/format'
import { LEADERBOARD_ENTITY, TOTALS_QUERY } from '../history/duckdb/queries'
import type { ItemSummary } from '../history/duckdb/queries'
import { itemRefQuery, parseItemRef } from '../history/itemRef'
import type { ItemRef } from '../history/itemRef'
import { BUCKET, yearsCovered } from '../history/range'
import { useItemStore } from '../stores/item'
import { ROUTE_PATH } from '../routes'

const BUCKET_LABEL: Record<string, string> = {
  [BUCKET.day]: 'a day',
  [BUCKET.week]: 'a week',
  [BUCKET.month]: 'a month',
}

const STATE = {
  failed: 'failed',
  loading: 'loading',
  unpicked: 'unpicked',
  missing: 'missing',
  ready: 'ready',
} as const

type State = (typeof STATE)[keyof typeof STATE]

type Tile = StatTileProps & { key: string }

const NOTHING_PICKED = 'Pick something to look at'

const GROUPING = {
  none: 'none',
  album: 'album',
} as const

type Grouping = (typeof GROUPING)[keyof typeof GROUPING]

const GROUPING_OPTIONS = [
  { value: GROUPING.none, label: 'Ranked' },
  { value: GROUPING.album, label: 'By album' },
]

const route = useRoute()
const router = useRouter()
const item = useItemStore()

const exportYears = ref<number[]>([])
const grouping = ref<Grouping>(GROUPING.none)

function applyRoute(): void {
  item.select(parseItemRef(route.query))
  void item.load()
}

const { status, message } = useHistoryDatabase(async (database) => {
  const [totals] = await database.query(TOTALS_QUERY)
  exportYears.value = totals === undefined ? [] : yearsCovered(totals.firstPlay, totals.lastPlay)
  item.select(parseItemRef(route.query))
  await item.load()
})

function chosenLabel(chosen: ItemRef | null): string {
  if (chosen === null) return NOTHING_PICKED
  return chosen.entity === LEADERBOARD_ENTITY.song ? chosen.uri : chosen.name
}

/** The item's own span, so no year is offered that it was never played in. */
function yearsFor(summary: ItemSummary | null, whole: number[]): number[] {
  if (summary === null || summary.firstPlay === '') return whole
  return yearsCovered(summary.firstPlay, summary.lastPlay)
}

function tilesFor(summary: ItemSummary): Tile[] {
  return [
    { key: 'plays', label: 'Plays', value: formatCount(summary.plays), note: 'in your history' },
    { key: 'hours', label: 'Hours', value: formatHours(summary.hours), note: 'time played' },
    { key: 'first', label: 'First heard', value: formatDate(summary.firstPlay), note: 'earliest' },
    { key: 'last', label: 'Last heard', value: formatDate(summary.lastPlay), note: 'most recent' },
  ]
}

const state = computed<State>(() => {
  if (status.value === HISTORY_STATUS.error || item.problem !== '') return STATE.failed
  if (status.value === HISTORY_STATUS.loading || item.loading) return STATE.loading
  if (item.selected === null) return STATE.unpicked
  return item.summary !== null && item.summary.plays > 0 ? STATE.ready : STATE.missing
})

const detail = computed(() => {
  const summary = item.summary
  return {
    heading: summary?.name ?? chosenLabel(item.selected),
    subheading: summary?.subtitle ?? '',
    granularity: BUCKET_LABEL[item.bucket] ?? 'a month',
    tiles: summary === null ? [] : tilesFor(summary),
    failure: status.value === HISTORY_STATUS.error ? message.value : item.problem,
    songs: item.songs.length,
    years: yearsFor(summary, exportYears.value),
    groupable: item.selected?.entity === LEADERBOARD_ENTITY.artist,
  }
})

// Navigation only. The route is the one source of truth for what is shown, so
// a song link inside the page loads the same way a pasted URL does.
async function pick(chosen: ItemRef): Promise<void> {
  await router.replace({ path: ROUTE_PATH.historyItem, query: itemRefQuery(chosen) })
}

watch(() => route.query, applyRoute)

watch(
  () => item.range,
  () => {
    void item.load()
  },
)
</script>

<template>
  <main class="item">
    <header class="bar">
      <BackLink
        class="bar__back"
        :to="ROUTE_PATH.historyLeaderboard"
        label="Back to the top lists"
      />
    </header>

    <section class="head">
      <h1 class="head__title">{{ detail.heading }}</h1>
      <p v-if="detail.subheading !== ''" class="head__subtitle">{{ detail.subheading }}</p>

      <HistoryItemSearch
        v-model="item.entity"
        class="head__search"
        :results="item.results"
        :searching="item.searching"
        @search="item.search"
        @pick="pick"
      />

      <HistoryRangePicker v-model="item.range" class="head__range" :years="detail.years" />
    </section>

    <p v-if="state === STATE.failed" class="state state--error" role="alert">
      {{ detail.failure }}
    </p>

    <template v-else-if="state === STATE.loading">
      <div class="body">
        <SkeletonBlock width="100%" height="120px" />
        <SkeletonBlock class="body__gap" width="100%" height="300px" />
      </div>
      <p class="state" role="status">{{ message }}</p>
    </template>

    <p v-else-if="state === STATE.unpicked" class="state">
      Search above for an artist, song or album to see how your listening to it changed.
    </p>

    <p v-else-if="state === STATE.missing" class="state">
      Nothing in your history matches that, or every play of it fell under the floor.
    </p>

    <div v-else class="body">
      <section class="tiles" :style="{ '--columns': detail.tiles.length }" aria-label="Totals">
        <StatTile
          v-for="tile in detail.tiles"
          :key="tile.key"
          :label="tile.label"
          :value="tile.value"
          :note="tile.note"
        />
      </section>

      <section class="panel">
        <h2 class="panel__title">Listening over time</h2>
        <p class="panel__note">
          One bar per {{ detail.granularity }}, with the running total alongside.
          {{ MIN_PLAY_CAVEAT }}
        </p>
        <HistoryProgressionChart :rows="item.progression" :bucket="item.bucket" />
      </section>

      <section v-if="detail.songs > 0" class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Songs</h2>
            <p class="panel__note">
              {{ detail.songs }} counted as a listen, most played first.
              {{ LATEST_ALBUM_CAVEAT }}
            </p>
          </div>

          <SegmentedControl
            v-if="detail.groupable"
            v-model="grouping"
            legend="Show"
            name="grouping"
            :options="GROUPING_OPTIONS"
          />
        </header>

        <HistoryAlbumGroups v-if="grouping === GROUPING.album" :songs="item.songs" />
        <HistoryLeaderboardTable
          v-else
          :rows="item.songs"
          :entity="LEADERBOARD_ENTITY.song"
          :show-subtitle="true"
        />
      </section>
    </div>
  </main>
</template>

<style scoped>
.item {
  --ink: #0a0c0a;
  --hairline: rgba(232, 236, 230, 0.1);
  --fg: #e9ede6;
  --fg-dim: #8b9186;
  --green: #1ed760;

  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 0 64px;
  background: var(--ink);
  color: var(--fg);
  text-align: left;
}

.bar {
  display: flex;
  align-items: center;
  padding: 16px 40px;
  border-bottom: 1px solid var(--hairline);

  @media (max-width: 1024px) {
    padding: 16px 20px;
  }
}

.bar__back {
  margin: 0;
}

.head {
  padding: 48px 40px 24px;

  @media (max-width: 1024px) {
    padding: 32px 20px 20px;
  }
}

.head__title {
  font-size: clamp(28px, 4.5vw, 44px);
  font-weight: 600;
  letter-spacing: -0.03em;
  margin: 0;
}

.head__subtitle {
  margin: 6px 0 0;
  font-size: 15px;
  color: var(--fg-dim);
}

.head__search {
  margin-top: 28px;
}

.head__range {
  margin-top: 20px;
}

.body {
  padding: 0 40px;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }
}

.body__gap {
  margin-top: 20px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: 1px;
  margin: 8px 0 0;
  padding: 0;
  background: var(--hairline);
  border-block: 1px solid var(--hairline);

  @media (max-width: 700px) {
    grid-template-columns: 1fr 1fr;
  }
}

.panel {
  padding: 40px 0 0;
}

/* The rule is what keeps the chart and the song list from reading as one block. */
.panel + .panel {
  margin-top: 40px;
  border-top: 1px solid var(--hairline);
}

.panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 6px;
}

.panel__note {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--fg-dim);
}

.state {
  margin: 32px 40px 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);

  @media (max-width: 1024px) {
    margin: 24px 20px 0;
  }
}

.state--error {
  color: #f6b3a6;
}
</style>
