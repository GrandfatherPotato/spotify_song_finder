<script lang="ts">
export const TOOLTIP_PLACEMENT = {
  top: 'top',
  bottom: 'bottom',
} as const

export type TooltipPlacement = (typeof TOOLTIP_PLACEMENT)[keyof typeof TOOLTIP_PLACEMENT]
</script>

<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ text: string; placement?: TooltipPlacement }>(), {
  placement: TOOLTIP_PLACEMENT.top,
})

/**
 * Handed to the trigger rather than applied here: only the trigger knows which
 * of its elements is the focusable one the description belongs to.
 */
const describedby = useId()
</script>

<template>
  <span class="tooltip">
    <slot :describedby="describedby" />

    <span
      :id="describedby"
      role="tooltip"
      class="tooltip__text"
      :class="`tooltip__text--${placement}`"
    >
      {{ text }}
    </span>
  </span>
</template>

<style scoped>
.tooltip {
  position: relative;
  display: inline-flex;
}

/* Hidden rather than absent, so the description stays associated for a screen
   reader that never hovers. */
.tooltip__text {
  position: absolute;
  z-index: 1;
  width: max-content;
  max-width: 260px;
  padding: 10px 12px;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: 0;
  text-transform: none;
  color: var(--fg, #e9ede6);
  background: var(--panel, #12150f);
  border: 1px solid var(--hairline, rgba(232, 236, 230, 0.1));
  border-radius: 3px;
  box-shadow: 0 16px 32px -12px rgba(0, 0, 0, 0.9);
  opacity: 0;
  visibility: hidden;
}

.tooltip__text--top {
  bottom: calc(100% + 10px);
  left: -8px;
}

.tooltip__text--bottom {
  top: calc(100% + 10px);
  right: 0;
}

.tooltip:hover .tooltip__text,
.tooltip:focus-within .tooltip__text {
  opacity: 1;
  visibility: visible;
}
</style>
