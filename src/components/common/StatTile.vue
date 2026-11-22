<script lang="ts">
export interface StatTileProps {
  label: string
  value: string
  note: string
  /** Shown on demand beside the figure it qualifies, never as a page footnote. */
  caveat?: string
}
</script>

<script setup lang="ts">
import Tooltip from './Tooltip.vue'

defineProps<StatTileProps>()
</script>

<template>
  <article class="tile">
    <p class="tile__value">{{ value }}</p>

    <p class="tile__label">
      {{ label }}
      <Tooltip v-if="caveat" :text="caveat" #default="{ describedby }">
        <button
          type="button"
          class="caveat__button"
          :aria-label="`About ${label}`"
          :aria-describedby="describedby"
        >
          ?
        </button>
      </Tooltip>
    </p>

    <p class="tile__note">{{ note }}</p>
  </article>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 28px 40px;
  background: var(--ink, #0a0c0a);

  @media (max-width: 1024px) {
    padding: 24px 20px;
  }
}

.tile__value {
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--fg, #e9ede6);
}

.tile__label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim, #8b9186);
}

.tile__note {
  font-size: 13px;
  color: var(--fg-dim, #8b9186);
}

.caveat__button {
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--fg-dim, #8b9186);
  background: transparent;
  border: 1px solid currentcolor;
  border-radius: 50%;
  cursor: help;
}

.caveat__button:hover {
  color: var(--green, #1ed760);
}

.caveat__button:focus-visible {
  outline: 2px solid var(--green, #1ed760);
  outline-offset: 2px;
}
</style>
