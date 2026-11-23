<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BackLink from '../components/common/BackLink.vue'
import SegmentedControl from '../components/common/SegmentedControl.vue'
import SkeletonBlock from '../components/common/SkeletonBlock.vue'
import HistoryLeaderboardTable from '../components/HistoryLeaderboardTable.vue'
import HistoryRangePicker from '../components/HistoryRangePicker.vue'
import HistoryTrendChart from '../components/HistoryTrendChart.vue'
import { HISTORY_STATUS, useHistoryDatabase } from '../composables/useHistoryDatabase'
import {
  ALBUM_ARTIST_CAVEAT,
  LATEST_ALBUM_CAVEAT,
  MIN_PLAY_CAVEAT,
  SINGLES_AS_ALBUMS_CAVEAT,
} from '../history/caveats'
import { LEADERBOARD_ENTITY, LEADERBOARD_SIZES, TOTALS_QUERY } from '../history/duckdb/queries'
import type { LeaderboardEntity, LeaderboardRow } from '../history/duckdb/queries'
import { UNNAMED } from '../history/labels'
import { yearsCovered } from '../history/range'
import { useLeaderboardStore } from '../stores/leaderboard'
import { ROUTE_PATH } from '../routes'

const ENTITY_OPTIONS = [
  { value: LEADERBOARD_ENTITY.artist, label: 'Artists' },
  { value: LEADERBOARD_ENTITY.song, label: 'Songs' },
  { value: LEADERBOARD_ENTITY.album, label: 'Albums' },
]

const ENTITY_CAVEATS: Record<LeaderboardEntity, string[]> = {
  [LEADERBOARD_ENTITY.artist]: [MIN_PLAY_CAVEAT, ALBUM_ARTIST_CAVEAT],
  [LEADERBOARD_ENTITY.song]: [MIN_PLAY_CAVEAT],
  [LEADERBOARD_ENTITY.album]: [
    MIN_PLAY_CAVEAT,
    ALBUM_ARTIST_CAVEAT,
    SINGLES_AS_ALBUMS_CAVEAT,
    LATEST_ALBUM_CAVEAT,
  ],
}

const leaderboard = useLeaderboardStore()

const years = ref<number[]>([])

const { status, message } = useHistoryDatabase(async (database) => {
  const [totals] = await database.query(TOTALS_QUERY)
  years.value = totals === undefined ? [] : yearsCovered(totals.firstPlay, totals.lastPlay)
  await leaderboard.load()
})

const caveats = computed(() => ENTITY_CAVEATS[leaderboard.entity])

function seriesLabel(row: LeaderboardRow): string {
  const name = row.name ?? UNNAMED
  return row.subtitle === null ? name : `${name} — ${row.subtitle}`
}

const chartedSeries = computed(() =>
  leaderboard.ranked.map((row) => ({ id: row.id, label: seriesLabel(row) })),
)

const showsSubtitle = computed(() => leaderboard.entity !== LEADERBOARD_ENTITY.artist)

const opening = computed(() => status.value === HISTORY_STATUS.loading)

const hasRows = computed(() => leaderboard.ranked.length > 0)

/** Only while the table is empty; a reload keeps the old rows up instead. */
const showsSkeleton = computed(() => opening.value || (leaderboard.loading && !hasRows.value))

const refreshing = computed(() => leaderboard.loading && hasRows.value)

watch(
  () => [leaderboard.entity, leaderboard.range],
  () => {
    void leaderboard.load()
  },
)
</script>

<template>
  <main class="board">
    <header class="bar">
      <BackLink class="bar__back" :to="ROUTE_PATH.historyOverview" label="Back to your history" />
    </header>

    <section class="head">
      <h1 class="head__title">Top of the lot</h1>

      <div class="controls">
        <SegmentedControl
          v-model="leaderboard.entity"
          legend="What to rank"
          name="entity"
          :options="ENTITY_OPTIONS"
        />

        <p class="field">
          <label class="field__label" for="leaderboard-size">How many</label>
          <select id="leaderboard-size" v-model="leaderboard.size" class="field__input">
            <option v-for="option in LEADERBOARD_SIZES" :key="option" :value="option">
              Top {{ option }}
            </option>
          </select>
        </p>

        <HistoryRangePicker v-model="leaderboard.range" :years="years" />
      </div>

      <ul class="caveats">
        <li v-for="caveat in caveats" :key="caveat" class="caveats__item">{{ caveat }}</li>
      </ul>
    </section>

    <div class="body">
      <p v-if="status === HISTORY_STATUS.error" class="state state--error" role="alert">
        {{ message }}
      </p>

      <template v-else-if="showsSkeleton">
        <div v-for="placeholder in leaderboard.size" :key="placeholder" class="skeleton-row">
          <SkeletonBlock width="100%" height="18px" />
        </div>
        <p class="state" role="status">{{ opening ? message : 'Counting the plays…' }}</p>
      </template>

      <p v-else-if="leaderboard.problem !== ''" class="state state--error" role="alert">
        {{ leaderboard.problem }}
      </p>

      <p v-else-if="!hasRows" class="state">
        Nothing was played for long enough to count in that range.
      </p>

      <template v-else>
        <p class="state state--busy" role="status">{{ refreshing ? 'Counting the plays…' : '' }}</p>

        <div class="results" :class="{ 'results--busy': refreshing }" :aria-busy="refreshing">
          <HistoryLeaderboardTable :rows="leaderboard.ranked" :show-subtitle="showsSubtitle" />

          <section class="trend">
            <h2 class="trend__title">Hours over time — top {{ leaderboard.ranked.length }}</h2>
            <HistoryTrendChart :rows="leaderboard.charted" :series="chartedSeries" />
          </section>
        </div>
      </template>
    </div>
  </main>
</template>

<style scoped>
.board {
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

.head,
.body {
  padding: 0 40px;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }
}

.head {
  padding-top: 48px;

  @media (max-width: 1024px) {
    padding-top: 32px;
  }
}

.head__title {
  font-size: clamp(30px, 5vw, 48px);
  font-weight: 600;
  letter-spacing: -0.03em;
  margin: 0 0 24px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 20px;
}

.field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.field__label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-dim);
}

.field__input {
  font: inherit;
  font-size: 14px;
  padding: 7px 10px;
  color: var(--fg);
  background: var(--ink);
  border: 1px solid var(--hairline);
  border-radius: 3px;
}

.caveats {
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}

.caveats__item {
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg-dim);
}

.skeleton-row {
  display: flex;
  align-items: center;
  padding: 15px 0;
  border-bottom: 1px solid var(--hairline);
}

/* Dimmed rather than removed: the previous answer stays readable while the
   next one is counted, so the page does not jump on every control change. */
.results--busy {
  opacity: 0.45;
  transition: opacity 120ms ease-out;
}

.state {
  margin: 32px 0 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);
}

.state--busy {
  min-height: 1em;
  margin: 12px 0 0;
}

.state--error {
  color: #f6b3a6;
}

.trend {
  padding: 48px 0 0;
}

.trend__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
}
</style>
