<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NOTICE_PARAM, noticeMessage } from '../../notices'

const route = useRoute()

const message = computed(() => noticeMessage(route.query[NOTICE_PARAM]))
</script>

<template>
  <p v-if="message" class="notice" role="status">
    <span class="notice__mark" aria-hidden="true">!</span>
    {{ message }}
  </p>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-left: 2px solid #e2b23c;
  border-radius: 0 3px 3px 0;
  background: rgba(226, 178, 60, 0.1);
  color: #f0d39a;
  font-size: 14px;
  line-height: 1.5;
}

.notice__mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid currentcolor;
  border-radius: 50%;
}
</style>
