<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Tooltip from './common/Tooltip.vue'
import { PARTIAL_YEARS_CAVEAT } from '../history/caveats'
import { customRange, inclusiveEnd, yearRange } from '../history/range'
import type { TimeRange } from '../history/range'

const ALL_TIME_OPTION = 'all-time'
const CUSTOM_OPTION = 'custom'

defineProps<{ years: readonly number[] }>()

const range = defineModel<TimeRange | null>({ required: true })

function presetFor(value: TimeRange | null): string {
  if (value === null) return ALL_TIME_OPTION
  const year = Number(value.start.slice(0, 4))
  const whole = yearRange(year)
  if (whole.start === value.start && whole.end === value.end) return String(year)
  return CUSTOM_OPTION
}

const preset = ref<string>(presetFor(range.value))
const from = ref(range.value?.start ?? '')
const to = ref(range.value === null ? '' : inclusiveEnd(range.value))

const isCustom = computed(() => preset.value === CUSTOM_OPTION)

const problem = computed(() => {
  if (!isCustom.value) return ''
  if (from.value === '' || to.value === '') return 'Pick both dates to set a range.'
  if (customRange(from.value, to.value) === null) {
    return 'Pick a start date on or before the end date.'
  }
  return ''
})

function pickedRange(): TimeRange | null | undefined {
  if (preset.value === ALL_TIME_OPTION) return null
  if (preset.value !== CUSTOM_OPTION) return yearRange(Number(preset.value))
  return customRange(from.value, to.value) ?? undefined
}

watch([preset, from, to], () => {
  const picked = pickedRange()
  if (picked === undefined) return
  range.value = picked
})
</script>

<template>
  <div class="picker">
    <p class="field">
      <label class="field__label" for="leaderboard-range">When</label>
      <select id="leaderboard-range" v-model="preset" class="field__input">
        <option :value="ALL_TIME_OPTION">All time</option>
        <option v-for="year in years" :key="year" :value="String(year)">{{ year }}</option>
        <option :value="CUSTOM_OPTION">Custom range…</option>
      </select>
      <Tooltip :text="PARTIAL_YEARS_CAVEAT" #default="{ describedby }">
        <button
          type="button"
          class="caveat"
          aria-label="About years"
          :aria-describedby="describedby"
        >
          ?
        </button>
      </Tooltip>
    </p>

    <p v-if="isCustom" class="field">
      <label class="field__label" for="range-from">From</label>
      <input id="range-from" v-model="from" class="field__input" type="date" />
      <label class="field__label" for="range-to">To</label>
      <input id="range-to" v-model="to" class="field__input" type="date" />
    </p>

    <p v-if="problem !== ''" class="problem" role="status">{{ problem }}</p>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
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

.caveat {
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: 11px;
  color: var(--fg-dim);
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: 50%;
  cursor: help;
}

.problem {
  flex-basis: 100%;
  margin: 0;
  font-size: 13px;
  color: #f6b3a6;
}
</style>
