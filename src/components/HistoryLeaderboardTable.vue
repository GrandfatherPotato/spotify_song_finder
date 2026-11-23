<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { LeaderboardEntity, LeaderboardRow } from '../history/duckdb/queries'
import { itemRefFor, itemRefQuery } from '../history/itemRef'
import { UNNAMED } from '../history/labels'
import { ROUTE_PATH } from '../routes'

const props = defineProps<{
  rows: readonly LeaderboardRow[]
  entity: LeaderboardEntity
  showSubtitle: boolean
}>()

const counts = new Intl.NumberFormat('en-GB')

const busiest = computed(() => Math.max(...props.rows.map((row) => row.plays), 0))

function barWidth(plays: number): string {
  return busiest.value === 0 ? '0%' : `${(plays / busiest.value) * 100}%`
}

const listed = computed(() =>
  props.rows.map((row) => {
    const ref = itemRefFor(props.entity, row)
    return {
      row,
      to: ref === null ? null : { path: ROUTE_PATH.historyItem, query: itemRefQuery(ref) },
    }
  }),
)
</script>

<template>
  <ol class="rows">
    <li v-for="({ row, to }, index) in listed" :key="row.id" class="row">
      <span class="row__rank">{{ index + 1 }}</span>
      <span class="row__name">
        <RouterLink v-if="to !== null" class="row__link" :to="to">
          {{ row.name ?? UNNAMED }}
        </RouterLink>
        <template v-else>{{ row.name ?? UNNAMED }}</template>
        <span v-if="showSubtitle" class="row__subtitle">{{ row.subtitle ?? UNNAMED }}</span>
      </span>
      <span class="row__bar" aria-hidden="true">
        <span class="row__fill" :style="{ width: barWidth(row.plays) }"></span>
      </span>
      <span class="row__plays">{{ counts.format(row.plays) }} plays</span>
      <span class="row__hours">{{ row.hours }} h</span>
    </li>
  </ol>
</template>

<style scoped>
/* One grid for the whole list, not one per row: with a grid per `li` the `auto`
   columns size to their own row's text, so "1,284 plays" and "976 plays" push
   the bar to different places. */
.rows {
  display: grid;
  grid-template-columns: 32px minmax(140px, 1.2fr) minmax(80px, 2fr) max-content max-content;
  column-gap: 16px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 700px) {
    grid-template-columns: 24px 1fr max-content;
  }
}

.row {
  position: relative;
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--hairline);
}

.row:hover,
.row:focus-within {
  background: rgba(30, 215, 96, 0.06);
}

.row__link {
  color: var(--fg);
  text-decoration: none;
}

/* Stretched so the whole row is the target, not just the name. */
.row__link::after {
  content: '';
  position: absolute;
  inset: 0;
}

.row__link:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: -2px;
}

.row__rank {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);
}

.row__name {
  display: flex;
  flex-direction: column;
  font-size: 15px;
}

.row__subtitle {
  font-size: 12px;
  color: var(--fg-dim);
}

.row__bar {
  height: 6px;
  border-radius: 999px;
  background: rgba(232, 236, 230, 0.06);

  @media (max-width: 700px) {
    display: none;
  }
}

.row__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--green);
}

.row__plays,
.row__hours {
  font-family: var(--mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--fg-dim);
}

.row__hours {
  @media (max-width: 700px) {
    display: none;
  }
}
</style>
