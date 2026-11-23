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

use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

const props = defineProps<{ rows: readonly TrendRow[]; series: readonly TrendSeriesRef[] }>()

const option = computed(() => trendOption(props.rows, props.series))
</script>

<template>
  <VChart class="chart" :option="option" autoresize />
</template>

<style scoped>
.chart {
  width: 100%;
  height: 320px;
}
</style>
