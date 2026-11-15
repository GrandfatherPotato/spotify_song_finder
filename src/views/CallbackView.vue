<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { completeLogin } from '../spotify/auth'
import { describeError } from '../spotify/errors'
import { ROUTE_PATH } from '../routes'

const router = useRouter()
const errorMessage = ref<string | null>(null)

onMounted(async () => {
  try {
    await completeLogin(window.location.search)
    await router.replace(ROUTE_PATH.finder)
  } catch (error) {
    errorMessage.value = describeError(error)
  }
})
</script>

<template>
  <main class="callback">
    <p v-if="errorMessage === null" class="status">Completing sign-in…</p>

    <template v-else>
      <p class="banner" role="alert">{{ errorMessage }}</p>
      <RouterLink class="link" :to="ROUTE_PATH.signIn">Back to sign in</RouterLink>
    </template>
  </main>
</template>

<style scoped>
.callback {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px 24px;
  background: #0a0c0a;
  color: #e9ede6;
}

.status {
  font-size: 15px;
  color: #8b9186;
  margin: 0;
}

.banner {
  max-width: 420px;
  margin: 0;
  padding: 12px 14px;
  border-left: 2px solid #f0624a;
  background: rgba(240, 98, 74, 0.1);
  color: #f6b3a6;
  font-size: 14px;
  line-height: 1.5;
}

.link {
  font-size: 14px;
  color: #1ed760;
}
</style>
