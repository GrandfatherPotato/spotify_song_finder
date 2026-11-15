<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_TRACKS_PER_ARTIST, findSimilar } from '../discovery/find'
import { artistKey, groupByArtist } from '../discovery/score'
import type { ScoredCandidate } from '../discovery/score'
import { isLastFmConfigured } from '../lastfm/api'
import type { Label } from '../lastfm/labels'
import { fetchLabels } from '../lastfm/labels'
import { describeError } from '../spotify/errors'
import type { SpotifyTrackRef } from '../spotify/library'
import { fetchFamiliarArtists, findTrack, searchTracks } from '../spotify/library'

const STAGE = {
  picking: 'picking',
  labelling: 'labelling',
  tuning: 'tuning',
  finding: 'finding',
  results: 'results',
} as const

type Stage = (typeof STAGE)[keyof typeof STAGE]

const PRESELECTED_LABELS = 5

// Spotify's own embed decides what a listener gets: a 30-second preview, or
// the whole track when they are Premium and signed in to Spotify in this
// browser. `preview_url` cannot do that job — it is deprecated and restricted
// for apps registered after 27 November 2024, so it comes back null.
const EMBED_BASE = 'https://open.spotify.com/embed/track/'

const stage = ref<Stage>(STAGE.picking)
const query = ref('')
const matches = ref<SpotifyTrackRef[]>([])
const seedTrack = ref<SpotifyTrackRef | null>(null)
const labels = ref<Label[]>([])
const selected = ref<Set<string>>(new Set())
const results = ref<ScoredCandidate[]>([])
const links = ref<Map<string, SpotifyTrackRef>>(new Map())
const errorMessage = ref<string | null>(null)

const configured = isLastFmConfigured()
const busy = computed(() => stage.value === STAGE.labelling || stage.value === STAGE.finding)

const selectedLabels = computed(() =>
  labels.value.filter((label) => selected.value.has(artistKey(label.name))),
)

const groups = computed(() => groupByArtist(results.value))

// Only the open track renders an iframe; mounting one per result would load a
// player for every row and let two play at once.
const playingKey = ref<string | null>(null)
const resolvingKey = ref<string | null>(null)
const unresolvable = ref<Set<string>>(new Set())

function spotifyId(candidate: ScoredCandidate): string | null {
  return links.value.get(resultKey(candidate))?.id ?? null
}

function markUnresolvable(key: string): void {
  unresolvable.value = new Set(unresolvable.value).add(key)
}

const PLAY_STATE = {
  ready: 'ready',
  resolving: 'resolving',
  open: 'open',
  absent: 'absent',
} as const

type PlayState = (typeof PLAY_STATE)[keyof typeof PLAY_STATE]

const PLAY_ICON: Record<PlayState, string> = {
  [PLAY_STATE.ready]: 'play_arrow',
  [PLAY_STATE.resolving]: 'progress_activity',
  [PLAY_STATE.open]: 'close',
  [PLAY_STATE.absent]: 'remove',
}

function playState(candidate: ScoredCandidate): PlayState {
  const key = resultKey(candidate)
  if (unresolvable.value.has(key)) return PLAY_STATE.absent
  if (resolvingKey.value === key) return PLAY_STATE.resolving

  return playingKey.value === key ? PLAY_STATE.open : PLAY_STATE.ready
}

function playLabel(candidate: ScoredCandidate): string {
  const key = resultKey(candidate)
  if (unresolvable.value.has(key)) return `${candidate.title} is not on Spotify`
  if (playingKey.value === key) return `Close player for ${candidate.title}`

  return `Play ${candidate.title}`
}

/**
 * Resolved when play is pressed rather than up front. Turning a Last.fm result
 * into a Spotify id costs one search each, and doing that for every result on
 * arrival was a burst of requests for songs nobody asked to hear.
 */
async function resolve(candidate: ScoredCandidate): Promise<boolean> {
  const key = resultKey(candidate)
  if (links.value.has(key)) return true

  resolvingKey.value = key
  try {
    const track = await findTrack(candidate.artist, candidate.title)
    if (track === null) {
      markUnresolvable(key)
      return false
    }

    links.value = new Map(links.value).set(key, track)
    return true
  } finally {
    resolvingKey.value = null
  }
}

async function togglePlay(candidate: ScoredCandidate): Promise<void> {
  const key = resultKey(candidate)
  if (playingKey.value === key) {
    playingKey.value = null
    return
  }

  errorMessage.value = null
  try {
    if (await resolve(candidate)) playingKey.value = key
  } catch (error) {
    errorMessage.value = describeError(error)
  }
}

function resultKey(candidate: Pick<ScoredCandidate, 'artist' | 'title'>): string {
  return `${artistKey(candidate.artist)} — ${artistKey(candidate.title)}`
}

function fail(error: unknown, fallback: Stage): void {
  errorMessage.value = describeError(error)
  stage.value = fallback
}

async function runSearch(): Promise<void> {
  errorMessage.value = null
  try {
    matches.value = await searchTracks(query.value)
  } catch (error) {
    fail(error, STAGE.picking)
  }
}

async function pick(track: SpotifyTrackRef): Promise<void> {
  seedTrack.value = track
  matches.value = []
  stage.value = STAGE.labelling
  errorMessage.value = null

  try {
    const found = await fetchLabels({ artist: track.artists[0] ?? '', track: track.title })
    labels.value = found
    selected.value = new Set(
      found.slice(0, PRESELECTED_LABELS).map((label) => artistKey(label.name)),
    )
    stage.value = STAGE.tuning
  } catch (error) {
    fail(error, STAGE.picking)
  }
}

function toggle(name: string): void {
  const key = artistKey(name)
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

function addLabel(label: Label): void {
  const key = artistKey(label.name)
  if (!labels.value.some((existing) => artistKey(existing.name) === key)) {
    labels.value = [...labels.value, label]
  }
  toggle(label.name)
}

async function find(): Promise<void> {
  const seed = seedTrack.value
  if (seed === null) return

  stage.value = STAGE.finding
  errorMessage.value = null

  try {
    const familiarArtists = await fetchFamiliarArtists()
    const ranked = await findSimilar({
      seed: { artist: seed.artists[0] ?? '', track: seed.title },
      selected: selectedLabels.value,
      familiarArtists,
    })

    results.value = ranked
    stage.value = STAGE.results
  } catch (error) {
    fail(error, STAGE.tuning)
  }
}

function restart(): void {
  stage.value = STAGE.picking
  seedTrack.value = null
  labels.value = []
  selected.value = new Set()
  results.value = []
  links.value = new Map()
  unresolvable.value = new Set()
  playingKey.value = null
  query.value = ''
  matches.value = []
}
</script>

<template>
  <section class="finder">
    <p class="eyebrow">Label&nbsp;/&nbsp;Finder</p>

    <p v-if="!configured" class="banner banner--warn">
      Set
      <code>VITE_LAST_FM_API_KEY</code>
      in
      <code>.env.local</code>
      and restart the dev server. Spotify no longer returns genre labels, so they come from Last.fm.
    </p>

    <template v-else>
      <form class="search" @submit.prevent="runSearch">
        <label class="visually-hidden" for="song-query">Find a song</label>
        <input
          id="song-query"
          v-model="query"
          class="input"
          type="search"
          placeholder="Artist or song title…"
          :disabled="busy"
        />
        <button
          type="submit"
          class="button button--primary"
          :disabled="busy || query.trim() === ''"
        >
          Search
        </button>
        <button v-if="seedTrack" type="button" class="button button--ghost" @click="restart">
          Start over
        </button>
      </form>

      <ul v-if="matches.length > 0" class="matches">
        <li v-for="track in matches" :key="track.id">
          <button type="button" class="match" @click="pick(track)">
            <img v-if="track.artworkUrl" class="art" :src="track.artworkUrl" alt="" />
            <span>
              <strong>{{ track.title }}</strong>
              <em>{{ track.artists.join(', ') }}</em>
            </span>
          </button>
        </li>
      </ul>

      <p v-if="stage === STAGE.labelling" class="lede">Reading the labels…</p>

      <template v-if="seedTrack && labels.length > 0">
        <h2 class="heading">
          {{ seedTrack.title }}
          <span class="dim">— {{ seedTrack.artists.join(', ') }}</span>
        </h2>

        <p class="note">
          Tick the labels worth keeping. Results are ranked on how much of the mix they share, so
          nothing has to match every label.
        </p>

        <ul class="labels">
          <li v-for="label in labels" :key="label.name">
            <button
              type="button"
              class="chip"
              :class="{ 'chip--on': selected.has(artistKey(label.name)) }"
              :aria-pressed="selected.has(artistKey(label.name))"
              @click="toggle(label.name)"
            >
              {{ label.name }}
              <span class="chip__source">{{ label.source }}</span>
            </button>
          </li>
        </ul>

        <div class="actions">
          <button
            type="button"
            class="button button--primary"
            :disabled="busy || selectedLabels.length === 0"
            @click="find"
          >
            {{ stage === STAGE.finding ? 'Searching…' : 'Find similar songs' }}
          </button>
        </div>
      </template>

      <template v-if="groups.length > 0">
        <h3 class="heading heading--small">
          {{ results.length }} songs across {{ groups.length }} artists
        </h3>

        <ol class="results">
          <li v-for="group in groups" :key="artistKey(group.artist)" class="group">
            <div class="group__head">
              <h4 class="group__artist">{{ group.artist }}</h4>
              <span v-if="group.familiar" class="badge">in your listening</span>
            </div>

            <ul class="labels labels--inline">
              <li v-for="label in group.labels.slice(0, 8)" :key="label.name">
                <button
                  type="button"
                  class="chip chip--small"
                  :class="{ 'chip--on': selected.has(artistKey(label.name)) }"
                  @click="addLabel(label)"
                >
                  {{ label.name }}
                </button>
              </li>
            </ul>

            <ul class="tracks">
              <li v-for="candidate in group.tracks" :key="resultKey(candidate)" class="track">
                <div class="track__row">
                  <button
                    type="button"
                    class="play"
                    :class="{ 'play--absent': unresolvable.has(resultKey(candidate)) }"
                    :disabled="
                      resolvingKey === resultKey(candidate) ||
                      unresolvable.has(resultKey(candidate))
                    "
                    :aria-pressed="playingKey === resultKey(candidate)"
                    :aria-label="playLabel(candidate)"
                    @click="togglePlay(candidate)"
                  >
                    <span
                      class="icon"
                      :class="{ 'icon--spin': playState(candidate) === PLAY_STATE.resolving }"
                      aria-hidden="true"
                    >
                      {{ PLAY_ICON[playState(candidate)] }}
                    </span>
                  </button>

                  <span class="track__title">{{ candidate.title }}</span>
                  <span v-if="unresolvable.has(resultKey(candidate))" class="track__note">
                    not on Spotify
                  </span>
                </div>

                <iframe
                  v-if="playingKey === resultKey(candidate)"
                  class="embed"
                  :title="`Spotify player for ${candidate.title}`"
                  :src="`${EMBED_BASE}${spotifyId(candidate)}`"
                  height="80"
                  loading="lazy"
                  allow="encrypted-media; clipboard-write"
                ></iframe>
              </li>
            </ul>
          </li>
        </ol>

        <p class="note">
          Labels sit on the artist, so tap any of them to fold it into the search and run it again.
          At most {{ MAX_TRACKS_PER_ARTIST }} songs are kept per artist. Play looks the song up on
          Spotify, then gives you a 30-second preview — or the whole track if you are Premium and
          signed in to Spotify in this browser. Spotify decides which.
        </p>
      </template>
    </template>

    <p v-if="errorMessage" class="banner banner--error" role="alert">{{ errorMessage }}</p>

    <p class="footnote">Catalogue and playback links from Spotify. Labels from Last.fm.</p>
  </section>
</template>

<style scoped>
.finder {
  --hairline: rgba(232, 236, 230, 0.1);
  --fg: #e9ede6;
  --fg-dim: #8b9186;
  --green: #1ed760;

  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 24px 64px;
  color: var(--fg);
  text-align: left;
}

.eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin: 0 0 24px;
}

.search {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
}

.input {
  flex: 1 1 240px;
  font: inherit;
  font-size: 15px;
  padding: 12px 16px;
  color: var(--fg);
  background: rgba(232, 236, 230, 0.05);
  border: 1px solid var(--hairline);
  border-radius: 999px;
}

.input:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}

.button {
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  padding: 12px 24px;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
}

.button--primary {
  color: #0a0c0a;
  background: var(--green);
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

.matches,
.labels,
.results {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
}

.matches {
  border-top: 1px solid var(--hairline);
}

.match {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 4px;
  font: inherit;
  text-align: left;
  color: inherit;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--hairline);
  cursor: pointer;
}

.match:hover {
  background: rgba(232, 236, 230, 0.04);
}

.art {
  width: 40px;
  height: 40px;
  flex: none;
  object-fit: cover;
}

.match strong,
.result strong {
  display: block;
  font-size: 15px;
  font-weight: 600;
}

.match em,
.result em {
  font-style: normal;
  font-size: 13px;
  color: var(--fg-dim);
}

.heading {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}

.heading--small {
  font-size: 13px;
  font-family: var(--mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fg-dim);
  margin: 32px 0 12px;
}

.dim {
  color: var(--fg-dim);
  font-weight: 400;
}

.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.labels--inline {
  margin: 10px 0 0;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font: inherit;
  font-size: 14px;
  padding: 7px 14px;
  color: var(--fg-dim);
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  cursor: pointer;
}

.chip--small {
  font-size: 12px;
  padding: 4px 10px;
}

.chip--on {
  color: #0a0c0a;
  background: var(--green);
  border-color: var(--green);
  font-weight: 600;
}

.chip__source {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.65;
}

.group {
  padding: 18px 0;
  border-bottom: 1px solid var(--hairline);
}

.group__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group__artist {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}

.tracks {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.track {
  padding: 4px 0 4px 14px;
  border-left: 1px solid var(--hairline);
}

.track__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.track__title {
  font-size: 14px;
}

.play {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  padding: 0;
  color: var(--green);
  background: transparent;
  border: 1px solid rgba(30, 215, 96, 0.4);
  border-radius: 50%;
  cursor: pointer;
}

/* line-height: 1 is what keeps these centred — the earlier ▶/× pair drifted
   because each sat differently inside an inherited 1.55 line box. */
.icon {
  display: block;
  font-family: 'Material Symbols Rounded';
  font-size: 16px;
  font-style: normal;
  font-weight: 400;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  font-variation-settings:
    'FILL' 1,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
  -webkit-font-smoothing: antialiased;
}

.icon--spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .icon--spin {
    animation: none;
  }
}

.play:hover {
  color: #0a0c0a;
  background: var(--green);
}

.play:focus-visible {
  outline: 2px solid var(--green);
  outline-offset: 2px;
}

.play:disabled {
  cursor: default;
}

.play--absent {
  color: var(--fg-dim);
  border-color: var(--hairline);
}

.play--absent:hover {
  color: var(--fg-dim);
  background: transparent;
}

.track__note {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fg-dim);
}

.embed {
  display: block;
  width: 100%;
  margin: 8px 0 4px;
  border: 0;
  border-radius: 12px;
}

.badge {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 3px 8px;
  color: var(--green);
  border: 1px solid rgba(30, 215, 96, 0.4);
  border-radius: 999px;
}

.link {
  font-size: 13px;
  color: var(--green);
  white-space: nowrap;
}

.lede,
.note,
.footnote {
  font-size: 14px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0 0 20px;
}

.note {
  font-size: 13px;
}

.banner {
  margin: 20px 0;
  padding: 12px 14px;
  border-left: 2px solid;
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
  margin: 32px 0 0;
  padding-top: 20px;
  border-top: 1px solid var(--hairline);
  font-size: 12px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

code {
  font-family: var(--mono);
  font-size: 12.5px;
  padding: 2px 6px;
  background: rgba(232, 236, 230, 0.07);
}
</style>
