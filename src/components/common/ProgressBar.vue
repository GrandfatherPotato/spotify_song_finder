<script setup lang="ts">
import { computed } from 'vue'

const PERCENT = 100

const props = withDefaults(defineProps<{ label: string; completed?: number; total?: number }>(), {
  completed: 0,
  total: 0,
})

/** No total yet — unzipping, or validating — so the bar paces itself instead. */
const indeterminate = computed(() => props.total <= 0)

const percent = computed(() =>
  indeterminate.value
    ? 0
    : Math.min(PERCENT, Math.round((props.completed / props.total) * PERCENT)),
)
</script>

<template>
  <div class="progress">
    <p class="progress__line">
      <span class="progress__label">{{ label }}</span>
      <span v-if="!indeterminate" class="progress__count">{{ completed }} / {{ total }}</span>
    </p>

    <div
      class="progress__track"
      role="progressbar"
      :aria-label="label"
      :aria-valuenow="indeterminate ? undefined : completed"
      :aria-valuemin="indeterminate ? undefined : 0"
      :aria-valuemax="indeterminate ? undefined : total"
    >
      <span
        class="progress__fill"
        :class="{ 'progress__fill--indeterminate': indeterminate }"
        :style="indeterminate ? undefined : { width: `${percent}%` }"
      ></span>
    </div>
  </div>
</template>

<style scoped>
.progress {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress__line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--fg-dim, #8b9186);
}

.progress__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.progress__count {
  flex: none;
}

.progress__track {
  position: relative;
  overflow: hidden;
  height: 3px;
  background: rgba(232, 236, 230, 0.1);
  border-radius: 999px;
}

.progress__fill {
  display: block;
  height: 100%;
  background: var(--green, #1ed760);
  border-radius: inherit;
  transition: width 240ms ease-out;
}

.progress__fill--indeterminate {
  width: 35%;
  animation: slide 1.4s ease-in-out infinite;
}

@keyframes slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(286%);
  }
}

/* Without motion the bar would read as stuck at the left; a steady partial
   fill at least says "working" honestly. */
@media (prefers-reduced-motion: reduce) {
  .progress__fill--indeterminate {
    width: 100%;
    opacity: 0.4;
    animation: none;
  }
}
</style>
