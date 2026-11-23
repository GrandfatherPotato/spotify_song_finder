<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import SegmentedControl from './common/SegmentedControl.vue'
import { LEADERBOARD_ENTITY } from '../history/duckdb/queries'
import type { LeaderboardEntity, SearchRow } from '../history/duckdb/queries'
import { UNNAMED } from '../history/labels'
import { itemRefFor } from '../history/itemRef'
import type { ItemRef } from '../history/itemRef'

const SEARCH_DELAY_MS = 250

const ENTITY_OPTIONS = [
  { value: LEADERBOARD_ENTITY.artist, label: 'Artist' },
  { value: LEADERBOARD_ENTITY.song, label: 'Song' },
  { value: LEADERBOARD_ENTITY.album, label: 'Album' },
]

const props = defineProps<{ results: readonly SearchRow[]; searching: boolean }>()

const emit = defineEmits<{ search: [fragment: string]; pick: [ref: ItemRef] }>()

const entity = defineModel<LeaderboardEntity>({ required: true })

const fragment = ref('')

let pending: ReturnType<typeof setTimeout> | undefined

// Without this every keystroke runs its own query, and a half-typed word's
// results flash past on the way to the one actually being looked for.
watch([fragment, entity], () => {
  clearTimeout(pending)
  pending = setTimeout(() => emit('search', fragment.value), SEARCH_DELAY_MS)
})

onUnmounted(() => {
  clearTimeout(pending)
})

function pick(row: SearchRow): void {
  const chosen = itemRefFor(entity.value, row)
  if (chosen !== null) emit('pick', chosen)
}
</script>

<template>
  <div class="search">
    <SegmentedControl
      v-model="entity"
      legend="Look for"
      name="item-entity"
      :options="ENTITY_OPTIONS"
    />

    <p class="field">
      <label class="field__label" for="item-search">Named</label>
      <input
        id="item-search"
        v-model="fragment"
        class="field__input"
        type="search"
        autocomplete="off"
        placeholder="Start typing…"
      />
    </p>

    <p v-if="searching" class="note" role="status">Searching…</p>

    <p v-else-if="fragment.trim() !== '' && props.results.length === 0" class="note">
      Nothing in your history matches that.
    </p>

    <ul v-else-if="props.results.length > 0" class="results">
      <li v-for="(row, index) in props.results" :key="`${row.uri ?? row.name}-${index}`">
        <button type="button" class="result" @click="pick(row)">
          <span class="result__name">{{ row.name ?? UNNAMED }}</span>
          <span v-if="row.subtitle !== null" class="result__subtitle">{{ row.subtitle }}</span>
          <span class="result__plays">{{ row.plays }} plays</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.search {
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
  min-width: 260px;
  padding: 7px 10px;
  color: var(--fg);
  background: var(--ink);
  border: 1px solid var(--hairline);
  border-radius: 3px;
}

.note {
  flex-basis: 100%;
  margin: 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);
}

.results {
  flex-basis: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: var(--hairline);
}

/* The row is as tall as its tallest result, and a percentage height would not
   resolve against the auto-sized `li`. A lone grid child stretches instead. */
.results li {
  display: grid;
}

.result {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  align-content: start;
  gap: 4px 12px;
  width: 100%;
  padding: 10px 14px;
  font: inherit;
  text-align: left;
  color: var(--fg);
  background: var(--ink);
  border: 0;
  cursor: pointer;
}

.result:hover,
.result:focus-visible {
  background: rgba(30, 215, 96, 0.1);
}

.result__name {
  font-size: 14px;
}

.result__subtitle {
  grid-column: 1;
  font-size: 12px;
  color: var(--fg-dim);
}

.result__plays {
  grid-row: 1;
  grid-column: 2;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-dim);
}
</style>
