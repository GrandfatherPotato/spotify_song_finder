<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ROUTE_PATH } from '../../routes'

withDefaults(defineProps<{ to?: string; label?: string }>(), {
  to: ROUTE_PATH.home,
  label: 'Back to the start',
})
</script>

<template>
  <RouterLink class="back" :to="to">{{ label }}</RouterLink>
</template>

<style scoped>
.back {
  display: inline-block;
  margin: 0 0 16px;
  font-size: 13px;
  color: inherit;
  opacity: 0.7;
  text-decoration: none;
}

.back::before {
  content: '←';
  margin-right: 8px;
}

.back:hover {
  opacity: 1;
  color: var(--green, #1ed760);
}

.back:focus-visible {
  outline: 2px solid var(--green, #1ed760);
  outline-offset: 3px;
}
</style>
