<script setup lang="ts">
import { RouterLink } from 'vue-router'

defineProps<LinkCardProps>()
</script>

<script lang="ts">
export interface LinkCardProps {
  to: string
  title: string
  body: string
}
</script>

<template>
  <li class="card">
    <h3 class="card__title">
      <RouterLink class="card__link" :to="to">{{ title }}</RouterLink>
    </h3>
    <p class="card__body">{{ body }}</p>
  </li>
</template>

<style scoped>
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
