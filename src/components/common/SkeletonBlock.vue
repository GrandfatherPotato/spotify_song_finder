<script setup lang="ts">
withDefaults(defineProps<{ width?: string; height?: string; radius?: string }>(), {
  width: '100%',
  height: '1em',
  radius: '3px',
})
</script>

<template>
  <span class="skeleton" aria-hidden="true" :style="{ width, height, borderRadius: radius }"></span>
</template>

<style scoped>
.skeleton {
  display: block;
  flex: none;
  background:
    linear-gradient(90deg, transparent, rgba(232, 236, 230, 0.09), transparent) -100% 0 / 200% 100%
      no-repeat,
    rgba(232, 236, 230, 0.05);
  animation: sweep 1.5s ease-in-out infinite;
}

@keyframes sweep {
  to {
    background-position: 200% 0;
  }
}

/* A sweeping placeholder is decoration; motion sensitivity outranks it. */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}
</style>
