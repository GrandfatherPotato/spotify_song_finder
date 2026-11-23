<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import BackLink from '../components/common/BackLink.vue'
import { useHistoryStore } from '../stores/history'
import type { QueryRows } from '../history'
import { describeOpfsRoot } from '../history/opfs'
import { HISTORY_QUERIES } from '../history/duckdb/queries'
import type { NamedQuery } from '../history/duckdb/query'
import { noExportSource } from '../history/export/source'
import { NOTICE, NOTICE_PARAM } from '../notices'
import { ROUTE_PATH } from '../routes'

const STATUS = {
  importing: 'importing',
  ready: 'ready',
  cleared: 'cleared',
  error: 'error',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]
type QueryName = keyof typeof HISTORY_QUERIES

const QUERY_NAMES = Object.keys(HISTORY_QUERIES) as QueryName[]

const history = useHistoryStore()

const status = ref<Status>(STATUS.importing)
const message = ref('Starting up…')
const activeQuery = ref<QueryName | null>(null)
const rows = shallowRef<QueryRows>([])
const queryError = ref('')
const opfs = ref('')

const columns = computed(() => Object.keys(rows.value[0] ?? {}))

const router = useRouter()

async function load(): Promise<void> {
  status.value = STATUS.importing
  activeQuery.value = null
  rows.value = []
  queryError.value = ''
  try {
    const opfsBefore = await describeOpfsRoot()
    const started = performance.now()
    const opened = await history.open(noExportSource(), (progress) => {
      message.value = `${progress.message} (${progress.completed + 1}/${progress.total})`
    })
    const elapsed = Math.round(performance.now() - started)
    message.value = `Loaded from ${opened.origin}, stored in ${opened.storage} — ${elapsed} ms`
    opfs.value = `OPFS on arrival: ${opfsBefore} · now: ${await describeOpfsRoot()}
${opened.diagnostics}`
    status.value = STATUS.ready
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
    status.value = STATUS.error
  }
}

// Nothing here can import an export; that is the gate's job. Arriving without
// one — a bookmark, or a snapshot cleared in another tab — means going back.
onMounted(async () => {
  if (await history.isStored()) await load()
  else
    await router.replace({ path: ROUTE_PATH.history, query: { [NOTICE_PARAM]: NOTICE.noHistory } })
})

/** Clears only. Importing again is the gate's job, reached from here by hand. */
async function resetStorage(): Promise<void> {
  status.value = STATUS.importing
  message.value = 'Clearing stored history…'
  activeQuery.value = null
  rows.value = []
  queryError.value = ''
  await history.reset()
  opfs.value = ''
  message.value = 'Stored history cleared.'
  status.value = STATUS.cleared
}

async function runQuery(name: QueryName): Promise<void> {
  const handle = history.database
  if (handle === null) return
  activeQuery.value = name
  queryError.value = ''
  try {
    // Widened so one handler can run any named query; the console renders
    // whatever columns come back rather than knowing them ahead of time.
    const named: NamedQuery<Record<string, unknown>, readonly unknown[]> = HISTORY_QUERIES[name]
    rows.value = await handle.query(named)
  } catch (error) {
    rows.value = []
    queryError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <main>
    <p><BackLink :to="ROUTE_PATH.historyOverview" label="Back to your history" /></p>

    <h1>Listening history</h1>
    <p v-if="status === STATUS.error" role="alert">{{ message }}</p>
    <p v-else>{{ message }}</p>
    <p v-if="opfs !== ''">{{ opfs }}</p>

    <p v-if="status === STATUS.ready">
      <button v-for="name in QUERY_NAMES" :key="name" type="button" @click="runQuery(name)">
        {{ name }}
      </button>
    </p>

    <p v-if="status !== STATUS.importing">
      <button type="button" @click="resetStorage">Clear stored history</button>
    </p>

    <p v-if="queryError !== ''" role="alert">{{ queryError }}</p>

    <template v-if="activeQuery !== null && queryError === ''">
      <h2>{{ activeQuery }} — {{ rows.length }} rows</h2>
      <table border="1" cellpadding="4">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td v-for="column in columns" :key="column">{{ row[column] }}</td>
          </tr>
        </tbody>
      </table>
    </template>
  </main>
</template>
