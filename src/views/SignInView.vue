<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BackLink from '../components/common/BackLink.vue'
import AppButton, { BUTTON_SIZE, BUTTON_VARIANT } from '../components/common/AppButton.vue'
import { beginLogin } from '../spotify/auth'
import { findRedirectUriProblem, readSpotifyConfig } from '../spotify/config'
import { describeError } from '../spotify/errors'
import { hasStoredTokens } from '../spotify/tokens'
import { ROUTE_PATH } from '../routes'

const router = useRouter()

const busy = ref(false)
const errorMessage = ref<string | null>(null)

const config = readSpotifyConfig()
const redirectProblem = config === null ? null : findRedirectUriProblem(config.redirectUri)

async function signIn(): Promise<void> {
  errorMessage.value = null
  busy.value = true

  try {
    await beginLogin()
  } catch (error) {
    errorMessage.value = describeError(error)
    busy.value = false
  }
}

onMounted(async () => {
  if (hasStoredTokens()) await router.replace(ROUTE_PATH.finder)
})
</script>

<template>
  <main class="auth">
    <div class="bloom" aria-hidden="true"></div>

    <section class="panel">
      <p class="eyebrow">Spotify&nbsp;/&nbsp;Song&nbsp;Finder</p>

      <BackLink />

      <template v-if="config === null">
        <h1 class="title">Add your client ID</h1>
        <p class="lede">
          Copy
          <code>.env.example</code>
          to
          <code>.env.local</code>
          and set
          <code>VITE_SPOTIFY_CLIENT_ID</code>
          from the Spotify Developer Dashboard. Then restart the dev server.
        </p>
      </template>

      <template v-else>
        <h1 class="title">Sign in with Spotify</h1>
        <p class="lede">
          Authorisation Code with PKCE. No secret leaves the Dashboard, and the access token lives
          only in this tab.
        </p>

        <div class="actions">
          <AppButton
            :variant="BUTTON_VARIANT.primary"
            :size="BUTTON_SIZE.medium"
            :disabled="busy || redirectProblem !== null"
            @click="signIn"
          >
            {{ busy ? 'Connecting…' : 'Continue with Spotify' }}
          </AppButton>
        </div>

        <p class="note">
          Requests
          <code>user-read-private</code>
          ,
          <code>user-top-read</code>
          and
          <code>user-read-recently-played</code>
          — the last two rank results by what you already listen to. In development mode Spotify
          allows five allowlisted accounts.
        </p>
      </template>

      <p v-if="redirectProblem" class="banner banner--warn">{{ redirectProblem }}</p>
      <p v-if="errorMessage" class="banner banner--error" role="alert">{{ errorMessage }}</p>

      <p class="footnote">Content and profile data provided by Spotify.</p>
    </section>
  </main>
</template>

<style scoped>
.auth {
  --ink: #0a0c0a;
  --panel: #12150f;
  --hairline: rgba(232, 236, 230, 0.1);
  --fg: #e9ede6;
  --fg-dim: #8b9186;
  --green: #1ed760;

  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  overflow: hidden;
  background: var(--ink);
  color: var(--fg);
  text-align: left;
}

.bloom {
  position: absolute;
  inset: -40% -10% auto -10%;
  height: 90%;
  background: radial-gradient(60% 55% at 50% 50%, rgba(30, 215, 96, 0.16), transparent 70%);
  filter: blur(8px);
  pointer-events: none;
}

.panel {
  position: relative;
  width: 100%;
  max-width: 480px;
  padding: 40px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(232, 236, 230, 0.04), transparent 40%), var(--panel);
  box-shadow: 0 32px 64px -24px rgba(0, 0, 0, 0.8);

  @media (max-width: 1024px) {
    padding: 28px;
  }
}

.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin: 0 0 28px;
}

.eyebrow::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 10px;
  border-radius: 50%;
  background: var(--green);
  vertical-align: 1px;
}

.title {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0 0 12px;
}

.lede,
.note,
.footnote {
  font-size: 15px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 24px 0;
}

.note {
  font-size: 13px;
}

.banner {
  margin: 20px 0 0;
  padding: 12px 14px;
  border-left: 2px solid;
  border-radius: 0 3px 3px 0;
  font-size: 14px;
  line-height: 1.5;
}

.banner--warn {
  border-color: #e2b23c;
  background: rgba(226, 178, 60, 0.1);
  color: #f0d39a;
}

.banner--error {
  border-color: #f0624a;
  background: rgba(240, 98, 74, 0.1);
  color: #f6b3a6;
}

.footnote {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--hairline);
  font-size: 12px;
}

code {
  font-family: var(--mono);
  font-size: 12.5px;
  padding: 2px 6px;
  color: var(--fg);
  background: rgba(232, 236, 230, 0.07);
}
</style>
