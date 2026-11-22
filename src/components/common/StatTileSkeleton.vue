<script setup lang="ts">
import SkeletonBlock from './SkeletonBlock.vue'
</script>

<template>
  <article class="tile">
    <SkeletonBlock width="55%" height="32px" />
    <SkeletonBlock width="35%" height="11px" />
    <SkeletonBlock width="70%" height="13px" />
  </article>
</template>

<style scoped>
/* Padding and gap mirror StatTile deliberately: the point of the placeholder is
   that nothing shifts when the real figures arrive. */
.tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 28px 40px;
  background: var(--ink, #0a0c0a);

  @media (max-width: 1024px) {
    padding: 24px 20px;
  }
}
</style>
