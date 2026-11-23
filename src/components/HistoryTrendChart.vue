<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { trendOption } from '../charts/trendOption'
import type { TrendSeriesRef } from '../charts/trendOption'
import type { TrendRow } from '../history/duckdb/queries'
import { NO_CHART_DATA } from '../history/labels'
import type { Bucket } from '../history/range'

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

const props = defineProps<{
  rows: readonly TrendRow[]
  series: readonly TrendSeriesRef[]
  bucket: Bucket
}>()

const option = computed(() => trendOption(props.rows, props.series, props.bucket))
</script>

<template>
  <p v-if="rows.length === 0" class="empty">{{ NO_CHART_DATA }}</p>
  <VChart v-else class="chart" :option="option" autoresize />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 320px;
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
