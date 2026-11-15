<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import SongFinder from '../components/SongFinder.vue'
import type { SpotifyUser } from '../spotify/api'
import { fetchCurrentUser } from '../spotify/api'
import { logOut } from '../spotify/auth'
import { describeError } from '../spotify/errors'
import { ROUTE_PATH } from '../routes'

const router = useRouter()

const profile = ref<SpotifyUser | null>(null)
const errorMessage = ref<string | null>(null)

async function signOut(): Promise<void> {
  logOut()
  await router.replace(ROUTE_PATH.signIn)
}

onMounted(async () => {
  try {
    profile.value = await fetchCurrentUser()
  } catch (error) {
    errorMessage.value = describeError(error)
  }
})
</script>

<template>
  <div class="shell">
    <header class="bar">
      <p class="brand">Spotify&nbsp;/&nbsp;Song&nbsp;Finder</p>

      <div class="account">
        <img v-if="profile?.imageUrl" class="avatar" :src="profile.imageUrl" alt="" />
        <span v-if="profile" class="name">{{ profile.displayName }}</span>
        <button type="button" class="signout" @click="signOut">Sign out</button>
      </div>
    </header>

    <p v-if="errorMessage" class="banner" role="alert">{{ errorMessage }}</p>

    <SongFinder />
  </div>
</template>

<style scoped>
.shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: #0a0c0a;
  color: #e9ede6;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid rgba(232, 236, 230, 0.1);
}

.brand {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8b9186;
  margin: 0;
}

.brand::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 10px;
  border-radius: 50%;
  background: #1ed760;
  vertical-align: 1px;
}

.account {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.name {
  font-size: 14px;
}

.signout {
  font: inherit;
  font-size: 13px;
  padding: 7px 16px;
  color: #e9ede6;
  background: transparent;
  border: 1px solid rgba(232, 236, 230, 0.1);
  border-radius: 999px;
  cursor: pointer;
}

.signout:hover {
  border-color: #8b9186;
}

.banner {
  margin: 16px 24px 0;
  padding: 12px 14px;
  border-left: 2px solid #f0624a;
  background: rgba(240, 98, 74, 0.1);
  color: #f6b3a6;
  font-size: 14px;
}
</style>
