<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { progressionOption } from '../charts/progressionOption'
import type { ProgressionRow } from '../history/duckdb/queries'
import { NO_CHART_DATA } from '../history/labels'
import type { Bucket } from '../history/range'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

const props = defineProps<{ rows: readonly ProgressionRow[]; bucket: Bucket }>()

const option = computed(() => progressionOption(props.rows, props.bucket))
</script>

<template>
  <p v-if="rows.length === 0" class="empty">{{ NO_CHART_DATA }}</p>
  <VChart v-else class="chart" :option="option" autoresize />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 360px;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 180px;
  margin: 0;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--fg-dim);
  border: 1px dashed var(--hairline);
  border-radius: 3px;
}
</style>
