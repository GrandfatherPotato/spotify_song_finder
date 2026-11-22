<script setup lang="ts">
import { RouterLink } from 'vue-router'
import NoticeBanner from '../components/common/NoticeBanner.vue'
import { ROUTE_PATH } from '../routes'

/** Spotify's development-mode ceiling; see docs/spotify-api-context.md. */
const MAX_ALLOWLISTED_USERS = 5
</script>

<template>
  <main class="home">
    <div class="bloom" aria-hidden="true"></div>

    <section class="panel">
      <p class="eyebrow">Backtrack</p>

      <NoticeBanner class="notice" />

      <h1 class="title">Two ways in</h1>
      <p class="lede">
        Search Spotify for something new, or dig through the listening history you already have.
      </p>

      <ul class="choices">
        <li class="choice">
          <h2 class="choice__title">
            <RouterLink class="choice__link" :to="ROUTE_PATH.signIn">Song finder</RouterLink>
            <span class="choice__badge">In progress</span>
          </h2>
          <p class="choice__body">
            Search the Spotify catalogue, then follow a track's Last.fm labels to others that sound
            like it — ranked against what you already listen to.
          </p>
          <p class="choice__warning">
            Spotify only lets this app admit {{ MAX_ALLOWLISTED_USERS }} accounts while it is in
            development, and each has to be added by hand. If yours is not one of them, signing in
            will fail — ask for an invite, or use the listening history instead.
          </p>
          <p class="choice__tag choice__tag--spotify">Requires a Spotify connection</p>
        </li>

        <li class="choice">
          <h2 class="choice__title">
            <RouterLink class="choice__link" :to="ROUTE_PATH.history">Listening history</RouterLink>
          </h2>
          <p class="choice__body">
            Load your Extended Streaming History export and explore years of plays — what you
            returned to, what you dropped, and when.
          </p>
          <p class="choice__tag">No Spotify account needed</p>
        </li>
      </ul>

      <p class="privacy">
        <strong>Everything stays in this browser.</strong>
        There is no server behind this page and no account to create. Your history export is read
        and queried on your own machine — it is never uploaded. If you connect Spotify, the access
        token lives in this tab and nowhere else.
      </p>

      <p class="footnote">Content and profile data provided by Spotify.</p>
    </section>
  </main>
</template>

<style scoped>
.home {
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
  max-width: 760px;
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

.notice {
  margin-bottom: 20px;
}

.title {
  font-size: 34px;
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin: 0 0 12px;
}

.lede,
.privacy,
.footnote {
  font-size: 15px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
}

.choice {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--hairline);
  border-radius: 3px;
  background: rgba(232, 236, 230, 0.02);
}

.choice:hover,
.choice:focus-within {
  border-color: var(--green);
  background: rgba(30, 215, 96, 0.06);
}

.choice__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}

.choice__badge {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  padding: 3px 8px;
  color: #f0d39a;
  background: rgba(226, 178, 60, 0.12);
  border: 1px solid rgba(226, 178, 60, 0.35);
  border-radius: 999px;
}

.choice__warning {
  font-size: 13px;
  line-height: 1.5;
  color: #f0d39a;
  margin: 0;
}

.choice__link {
  color: var(--fg);
  text-decoration: none;
}

/* Stretches the anchor over the whole card so the entire tile is clickable. */
.choice__link::after {
  content: '';
  position: absolute;
  inset: 0;
}

.choice__link:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 3px;
}

.choice__body {
  flex: 1;
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.choice__tag {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin: 0;
}

.choice__tag--spotify {
  color: var(--green);
}

.privacy {
  margin-top: 24px;
  padding: 14px 16px;
  border-left: 2px solid var(--green);
  border-radius: 0 3px 3px 0;
  background: rgba(30, 215, 96, 0.07);
  font-size: 13.5px;
}

.privacy strong {
  color: var(--fg);
  font-weight: 600;
}

.footnote {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--hairline);
  font-size: 12px;
}
</style>
