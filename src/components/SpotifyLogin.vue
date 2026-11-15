<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SpotifyUser } from '../spotify/api'
import { fetchCurrentUser } from '../spotify/api'
import { beginLogin, completeLogin, hasAuthCallback, logOut } from '../spotify/auth'
import { findRedirectUriProblem, readSpotifyConfig } from '../spotify/config'
import { describeError } from '../spotify/errors'
import { hasStoredTokens } from '../spotify/tokens'

const STATUS = {
  checking: 'checking',
  signedOut: 'signed-out',
  busy: 'busy',
  signedIn: 'signed-in',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]

const status = ref<Status>(STATUS.checking)
const profile = ref<SpotifyUser | null>(null)
const errorMessage = ref<string | null>(null)

const config = readSpotifyConfig()
const redirectProblem = config === null ? null : findRedirectUriProblem(config.redirectUri)

function fail(error: unknown): void {
  errorMessage.value = describeError(error)
  status.value = profile.value === null ? STATUS.signedOut : STATUS.signedIn
}

function clearCallbackFromUrl(): void {
  window.history.replaceState({}, '', window.location.pathname)
}

async function signIn(): Promise<void> {
  errorMessage.value = null
  status.value = STATUS.busy

  try {
    await beginLogin()
  } catch (error) {
    fail(error)
  }
}

function signOut(): void {
  logOut()
  profile.value = null
  errorMessage.value = null
  status.value = STATUS.signedOut
}

onMounted(async () => {
  try {
    if (hasAuthCallback(window.location.search)) {
      status.value = STATUS.busy
      await completeLogin(window.location.search)
      clearCallbackFromUrl()
    }

    if (!hasStoredTokens()) {
      status.value = STATUS.signedOut
      return
    }

    profile.value = await fetchCurrentUser()
    status.value = STATUS.signedIn
  } catch (error) {
    clearCallbackFromUrl()
    fail(error)
  }
})
</script>

<template>
  <main class="auth">
    <div class="bloom" aria-hidden="true"></div>

    <section class="panel">
      <p class="eyebrow">Spotify&nbsp;/&nbsp;Song&nbsp;Finder</p>

      <template v-if="status === STATUS.checking">
        <h1 class="title">Checking your session</h1>
        <p class="lede">One moment.</p>
      </template>

      <template v-else-if="profile !== null">
        <div class="identity">
          <img v-if="profile.imageUrl" class="avatar" :src="profile.imageUrl" alt="" />
          <span v-else class="avatar avatar--blank" aria-hidden="true">
            {{ profile.displayName.slice(0, 1) }}
          </span>
          <div>
            <p class="label">Signed in as</p>
            <h1 class="title title--name">{{ profile.displayName }}</h1>
          </div>
        </div>

        <dl class="facts">
          <div>
            <dt>User ID</dt>
            <dd>{{ profile.id }}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>Token held in sessionStorage</dd>
          </div>
        </dl>

        <div class="actions">
          <a
            v-if="profile.profileUrl"
            class="button button--primary"
            :href="profile.profileUrl"
            target="_blank"
            rel="noreferrer"
          >
            Open Spotify profile
          </a>
          <button type="button" class="button button--ghost" @click="signOut">Sign out</button>
        </div>
      </template>

      <template v-else-if="config === null">
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
          <button
            type="button"
            class="button button--primary"
            :disabled="status === STATUS.busy || redirectProblem !== null"
            @click="signIn"
          >
            {{ status === STATUS.busy ? 'Connecting…' : 'Continue with Spotify' }}
          </button>
        </div>

        <p class="note">
          Requests the
          <code>user-read-private</code>
          scope only. In development mode Spotify allows five allowlisted accounts.
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

.panel > * {
  animation: rise 0.5s cubic-bezier(0.2, 0.7, 0.3, 1) backwards;
}
.panel > *:nth-child(2) {
  animation-delay: 0.06s;
}
.panel > *:nth-child(3) {
  animation-delay: 0.12s;
}
.panel > *:nth-child(4) {
  animation-delay: 0.18s;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel > * {
    animation: none;
  }
}

.eyebrow,
.label {
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

.label {
  margin: 0 0 4px;
}

.title {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.03em;
  color: var(--fg);
  margin: 0 0 12px;
}

.title--name {
  font-size: 26px;
  margin: 0;
  overflow-wrap: anywhere;
}

.lede,
.note,
.footnote {
  font-size: 15px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.identity {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 28px;
}

.avatar {
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
  box-shadow:
    0 0 0 1px var(--ink),
    0 0 0 3px var(--green);
}

.avatar--blank {
  display: grid;
  place-items: center;
  font-size: 26px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--green);
}

.facts {
  margin: 0 0 28px;
  border-top: 1px solid var(--hairline);
}

.facts > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid var(--hairline);
}

.facts dt {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim);
  padding-top: 2px;
}

.facts dd {
  margin: 0;
  font-size: 14px;
  text-align: right;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.button {
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 26px;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  text-decoration: none;
  transition:
    transform 0.15s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.button:active:not(:disabled) {
  transform: scale(0.97);
}

.button:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}

.button--primary {
  color: var(--ink);
  background: var(--green);
}

.button--primary:hover:not(:disabled) {
  background: #25f06d;
}

.button--primary:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.button--ghost {
  color: var(--fg);
  background: transparent;
  border-color: var(--hairline);
}

.button--ghost:hover {
  border-color: var(--fg-dim);
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
