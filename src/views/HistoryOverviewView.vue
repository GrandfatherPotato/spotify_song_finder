<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BackLink from '../components/common/BackLink.vue'
import AppButton, { BUTTON_VARIANT } from '../components/common/AppButton.vue'
import SkeletonBlock from '../components/common/SkeletonBlock.vue'
import StatTile from '../components/common/StatTile.vue'
import type { StatTileProps } from '../components/common/StatTile.vue'
import StatTileSkeleton from '../components/common/StatTileSkeleton.vue'
import Tooltip, { TOOLTIP_PLACEMENT } from '../components/common/Tooltip.vue'
import { hasStoredHistory, resetHistoryStorage, sharedHistoryDatabase } from '../history'
import { IMPORT_QUALITY_QUERY, MIN_PLAY_MS, TOTALS_QUERY } from '../history/duckdb/queries'
import type { ImportQuality } from '../history/duckdb/queries'
import { noExportSource } from '../history/export/source'
import { yearsSpanned } from '../history/summary'
import type { HistorySummary } from '../history/summary'
import { NOTICE, NOTICE_PARAM } from '../notices'
import { ROUTE_PATH } from '../routes'

const STATUS = {
  loading: 'loading',
  ready: 'ready',
  error: 'error',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]

const HOURS_PER_DAY = 24
const MS_PER_SECOND = 1000

/** Tiles per row while loading; the same shape the real rows settle into. */
const SKELETON_ROWS = [3, 4]

/** Derived, not typed as copy, so the wording cannot drift from the floor. */
const MIN_PLAY_SECONDS = MIN_PLAY_MS / MS_PER_SECOND

const router = useRouter()

const status = ref<Status>(STATUS.loading)
const message = ref('Opening your history…')
const summary = ref<HistorySummary | null>(null)
const quality = ref<ImportQuality | null>(null)

const counts = new Intl.NumberFormat('en-GB')
const dates = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatCount(value: number): string {
  return counts.format(Math.round(value))
}

/** The dates arrive as plain `YYYY-MM-DD`; pinning to UTC stops a westward
    timezone rendering them a day early. */
function formatDate(iso: string): string {
  const parsed = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(parsed) ? '—' : dates.format(parsed)
}

const span = computed(() => (summary.value === null ? 0 : yearsSpanned(summary.value)))

const spanned = computed(() => `${span.value} ${span.value === 1 ? 'year' : 'years'}`)

/** An export can be legitimately empty — all podcasts, or files holding `[]`. */
const isEmpty = computed(() => summary.value !== null && summary.value.plays === 0)

const skipped = computed(() => quality.value?.malformedRows ?? 0)

const days = computed(() =>
  summary.value === null ? 0 : Math.round(summary.value.totalHours / HOURS_PER_DAY),
)

type Tile = StatTileProps & { key: string }

const CLEAR_STORAGE_WARNING =
  'Deletes the imported history from this browser and takes you back to the start. You will need your export file again to rebuild it.'

const ALBUM_ARTIST_CAVEAT =
  'Spotify records the album artist, not the track artist, so a featured artist’s plays are credited to the primary artist.'

/** Two rows: how much was recorded, then what it was made of. */
const tileRows = computed(() => {
  const totals = summary.value
  if (totals === null) return []
  return [
    { key: 'counts', label: 'Totals', tiles: countTiles(totals) },
    { key: 'library', label: 'Library', tiles: libraryTiles(totals) },
  ]
})

function countTiles(totals: HistorySummary): Tile[] {
  return [
    {
      key: 'entries',
      label: 'Entries',
      value: formatCount(totals.plays),
      note: 'one row per play Spotify logged',
    },
    {
      key: 'heard',
      label: 'Real listens',
      value: formatCount(totals.heardPlays),
      note: `song plays of ${MIN_PLAY_SECONDS} seconds or more`,
    },
    {
      key: 'tracks',
      label: 'Different songs',
      value: formatCount(totals.uniqueTracks),
      note: 'distinct tracks, however briefly played',
    },
  ]
}

function libraryTiles(totals: HistorySummary): Tile[] {
  return [
    {
      key: 'artists',
      label: 'Artists',
      value: formatCount(totals.uniqueArtists),
      note: 'by album artist',
      caveat: ALBUM_ARTIST_CAVEAT,
    },
    {
      key: 'episodes',
      label: 'Podcast episodes',
      value: formatCount(totals.episodePlays),
      note: 'episode plays',
    },
    {
      key: 'audiobooks',
      label: 'Audiobook chapters',
      value: formatCount(totals.audiobookPlays),
      note: 'chapter plays',
    },
    {
      key: 'music-hours',
      label: 'Hours of music',
      value: formatCount(totals.trackHours),
      note: 'podcasts and books excluded',
    },
  ]
}

async function clearStorage(): Promise<void> {
  await resetHistoryStorage()
  await router.replace({ path: ROUTE_PATH.home, query: { [NOTICE_PARAM]: NOTICE.noHistory } })
}

onMounted(async () => {
  if (!(await hasStoredHistory())) {
    await router.replace({ path: ROUTE_PATH.history, query: { [NOTICE_PARAM]: NOTICE.noHistory } })
    return
  }
  try {
    const database = await sharedHistoryDatabase(noExportSource(), (step) => {
      message.value = `${step.message} (${step.completed + 1}/${step.total})`
    })
    const [totals] = await database.query(TOTALS_QUERY)
    summary.value = totals ?? null
    const [report] = await database.query(IMPORT_QUALITY_QUERY)
    quality.value = report ?? null
    status.value = STATUS.ready
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    status.value = STATUS.error
  }
})
</script>

<template>
  <main class="overview">
    <header class="bar">
      <BackLink class="bar__back" />
      <Tooltip
        class="bar__clear"
        :text="CLEAR_STORAGE_WARNING"
        :placement="TOOLTIP_PLACEMENT.bottom"
        #default="{ describedby }"
      >
        <AppButton
          :variant="BUTTON_VARIANT.danger"
          :aria-describedby="describedby"
          @click="clearStorage"
        >
          Clear storage
        </AppButton>
      </Tooltip>
    </header>

    <template v-if="status === STATUS.loading">
      <section class="hero">
        <SkeletonBlock width="min(620px, 72%)" height="clamp(34px, 6vw, 64px)" />
        <SkeletonBlock class="hero__skeleton-lede" width="min(460px, 60%)" height="18px" />
        <SkeletonBlock
          class="hero__skeleton-figure"
          width="min(340px, 52%)"
          height="clamp(56px, 11vw, 132px)"
        />
      </section>

      <section
        v-for="(columns, index) in SKELETON_ROWS"
        :key="index"
        class="tiles"
        :style="{ '--columns': columns }"
      >
        <StatTileSkeleton v-for="tile in columns" :key="tile" />
      </section>

      <p class="state" role="status">{{ message }}</p>
    </template>

    <p v-else-if="status === STATUS.error" class="state state--error" role="alert">
      {{ message }}
    </p>

    <section v-else-if="isEmpty" class="hero">
      <h1 class="hero__title">Nothing to show yet</h1>
      <p class="hero__lede">
        That export imported cleanly but holds no plays — the history files in it were empty. Load a
        different export and this page will fill itself in.
      </p>
      <p class="hero__aside">
        <RouterLink class="hero__link" :to="ROUTE_PATH.history">Load another export</RouterLink>
      </p>
    </section>

    <template v-else-if="summary !== null">
      <section class="hero">
        <h1 class="hero__title">Welcome to your history</h1>
        <p class="hero__lede">
          {{ spanned }} of listening, from {{ formatDate(summary.firstPlay) }} to
          {{ formatDate(summary.lastPlay) }}. It is all here, and all on this machine.
        </p>

        <p class="hero__figure">
          <span class="hero__number">{{ formatCount(summary.totalHours) }}</span>
          <span class="hero__unit">hours played</span>
        </p>
        <p class="hero__aside">
          That is {{ formatCount(days) }} days end to end — without sleeping, eating or stopping.
        </p>
      </section>

      <section
        v-for="row in tileRows"
        :key="row.key"
        class="tiles"
        :style="{ '--columns': row.tiles.length }"
        :aria-label="row.label"
      >
        <StatTile
          v-for="tile in row.tiles"
          :key="tile.key"
          :label="tile.label"
          :value="tile.value"
          :note="tile.note"
          :caveat="tile.caveat"
        />
      </section>

      <p v-if="skipped > 0" class="skipped">
        {{ formatCount(skipped) }} rows in the export named nothing playable — no track, episode or
        audiobook — so they are counted here but left out of the figures above.
      </p>

      <section class="explore">
        <h2 class="explore__title">Explore it</h2>
        <p class="explore__lede">More ways to read this are on the way. For now:</p>

        <ul class="explore__list">
          <li class="card">
            <h3 class="card__title">
              <RouterLink class="card__link" :to="ROUTE_PATH.historyTest">
                Run the raw queries
              </RouterLink>
            </h3>
            <p class="card__body">
              The query console the rest of this is built on — totals, top artists per year and the
              import's integrity checks, straight out of DuckDB.
            </p>
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.overview {
  --ink: #0a0c0a;
  --panel: #12150f;
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
  gap: 20px;
  padding: 16px 40px;
  border-bottom: 1px solid var(--hairline);

  @media (max-width: 1024px) {
    padding: 16px 20px;
  }
}

/* BackLink carries bottom margin for the stacked panels it was built for; in a
   row it needs none. */
.bar__back {
  margin: 0;
}

.bar__clear {
  margin-left: auto;
}

.state {
  margin: 48px 40px 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);
}

.state--error {
  color: #f6b3a6;
}

.hero {
  position: relative;
  padding: 72px 40px 56px;
  overflow: hidden;
  background: radial-gradient(60% 120% at 20% 0%, rgba(30, 215, 96, 0.16), transparent 70%);

  @media (max-width: 1024px) {
    padding: 48px 20px 40px;
  }
}

.hero__skeleton-lede {
  margin-top: 20px;
}

.hero__skeleton-figure {
  margin-top: 40px;
}

.hero__title {
  font-size: clamp(34px, 6vw, 64px);
  font-weight: 600;
  line-height: 1.02;
  letter-spacing: -0.04em;
  color: var(--fg);
  margin: 0 0 16px;
}

.hero__lede {
  max-width: 62ch;
  font-size: 17px;
  line-height: 1.5;
  color: var(--fg-dim);
  margin: 0;
}

.hero__figure {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin: 40px 0 0;
}

.hero__number {
  font-size: clamp(56px, 11vw, 132px);
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.05em;
  color: var(--green);
}

.hero__unit {
  font-family: var(--mono);
  font-size: 13px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim);
}

.hero__aside {
  margin: 16px 0 0;
  font-size: 15px;
  color: var(--fg-dim);
}

/* Each row is told how many tiles it holds, so the two rows stay two rows
   instead of reflowing into one ragged block. */
.tiles {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--hairline);
  border-block: 1px solid var(--hairline);
}

/* One hairline between the rows, not two stacked. */
.tiles + .tiles {
  border-top: 0;
}

@media (max-width: 1024px) {
  .tiles {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 560px) {
  .tiles {
    grid-template-columns: 1fr;
  }
}

.hero__link {
  color: var(--green);
}

.skipped {
  margin: 32px 40px 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--fg-dim);

  @media (max-width: 1024px) {
    margin: 24px 20px 0;
  }
}

.explore {
  padding: 56px 40px 0;

  @media (max-width: 1024px) {
    padding: 40px 20px 0;
  }
}

.explore__title {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--fg);
  margin: 0 0 8px;
}

.explore__lede {
  font-size: 15px;
  color: var(--fg-dim);
}

.explore__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin: 24px 0 0;
  padding: 0;
  list-style: none;
}

.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: rgba(232, 236, 230, 0.02);
}

.card:hover,
.card:focus-within {
  border-color: var(--green);
  background: rgba(30, 215, 96, 0.06);
}

.card__title {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
  margin: 0;
}

.card__link {
  color: var(--fg);
  text-decoration: none;
}

/* Stretches the anchor over the whole card so the entire tile is clickable. */
.card__link::after {
  content: '';
  position: absolute;
  inset: 0;
}

.card__link:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}

.card__body {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-dim);
}
</style>
