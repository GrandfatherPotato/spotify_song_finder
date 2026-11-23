<script setup lang="ts">
import { computed } from 'vue'
import HistoryLeaderboardTable from './HistoryLeaderboardTable.vue'
import { LEADERBOARD_ENTITY } from '../history/duckdb/queries'
import type { LeaderboardRow } from '../history/duckdb/queries'
import { formatCount, formatHours } from '../history/format'
import { groupSongsByAlbum } from '../history/grouping'

const props = defineProps<{ songs: readonly LeaderboardRow[] }>()

const groups = computed(() => groupSongsByAlbum(props.songs))
</script>

<template>
  <div class="groups">
    <section v-for="group in groups" :key="group.album" class="group">
      <h3 class="group__title">
        {{ group.album }}
        <span class="group__figures">
          {{ formatCount(group.plays) }} plays · {{ formatHours(group.hours) }} h
        </span>
      </h3>
      <HistoryLeaderboardTable
        :rows="group.songs"
        :entity="LEADERBOARD_ENTITY.song"
        :show-subtitle="false"
      />
    </section>
  </div>
</template>

<style scoped>
.group + .group {
  margin-top: 32px;
}

.group__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  margin: 0;
  padding-bottom: 8px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--fg);
  border-bottom: 1px solid var(--hairline);
}

.group__figures {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  color: var(--fg-dim);
}
</style>
