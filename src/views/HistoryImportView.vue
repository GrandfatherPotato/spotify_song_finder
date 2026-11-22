<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import BackLink from '../components/common/BackLink.vue'
import AppButton from '../components/common/AppButton.vue'
import HistoryExportGuide from '../components/HistoryExportGuide.vue'
import ProgressBar from '../components/common/ProgressBar.vue'
import { isLocalEnvironment } from '../env'
import { hasStoredHistory, sharedHistoryDatabase } from '../history'
import { selectedExportSource } from '../history/export/selection'
import { devDataSource } from '../history/export/source'
import type { ExportSource } from '../history/export/source'
import { EXPORT_FORMAT_HELP } from '../history/export/validate'
import NoticeBanner from '../components/common/NoticeBanner.vue'
import { ROUTE_PATH } from '../routes'

const STATUS = {
  checking: 'checking',
  waiting: 'waiting',
  importing: 'importing',
} as const

type Status = (typeof STATUS)[keyof typeof STATUS]

interface Progress {
  label: string
  completed: number
  total: number
}

/**
 * Reading, loading and snapshotting each count from zero, so the bar measures
 * the step it is on rather than pretending to know the whole job.
 */
const UNCOUNTED: Progress = { label: 'Checking the files…', completed: 0, total: 0 }

const router = useRouter()

const status = ref<Status>(STATUS.checking)
const progress = ref<Progress>(UNCOUNTED)
const problem = ref('')

const localDataAllowed = isLocalEnvironment()

onMounted(async () => {
  if (await hasStoredHistory()) {
    await router.replace(ROUTE_PATH.historyOverview)
    return
  }
  status.value = STATUS.waiting
})

async function importFrom(resolveSource: () => Promise<ExportSource>): Promise<void> {
  problem.value = ''
  status.value = STATUS.importing
  progress.value = UNCOUNTED
  try {
    const source = await resolveSource()
    await sharedHistoryDatabase(source, (step) => {
      // `completed` is the index of the file being read, not the count finished.
      progress.value = { label: step.message, completed: step.completed + 1, total: step.total }
    })
    await router.replace(ROUTE_PATH.historyOverview)
  } catch (error) {
    problem.value = error instanceof Error ? error.message : String(error)
    status.value = STATUS.waiting
  }
}

async function onPick(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  // No need to reset the input: showing progress unmounts it, and the error
  // path mounts a fresh one, so the same folder can be picked again.
  await importFrom(() => selectedExportSource([...(input.files ?? [])]))
}

function importLocalData(): Promise<void> {
  return importFrom(async () => devDataSource())
}
</script>

<template>
  <main class="import">
    <div class="bloom" aria-hidden="true"></div>

    <section class="panel">
      <BackLink />

      <NoticeBanner class="notice" />

      <h1 class="title">Load your listening history</h1>
      <p class="lede">
        Spotify will send you every play it has recorded. Point us at that export and we will build
        the picture — here, on this machine. Nothing is uploaded.
      </p>

      <p v-if="status === STATUS.checking" class="progress">Looking for an earlier import…</p>

      <template v-if="status === STATUS.waiting">
        <div class="pickers">
          <div class="picker">
            <label class="picker__title" for="history-folder">Pick the folder</label>
            <span id="history-folder-hint" class="picker__hint">
              The unzipped export, however you named it
            </span>
            <input
              id="history-folder"
              aria-describedby="history-folder-hint"
              type="file"
              webkitdirectory
              multiple
              @change="onPick"
            />
          </div>

          <div class="picker">
            <label class="picker__title" for="history-zip">Pick the .zip</label>
            <span id="history-zip-hint" class="picker__hint">
              Straight from Spotify, no unzipping needed
            </span>
            <input
              id="history-zip"
              aria-describedby="history-zip-hint"
              type="file"
              accept=".zip,application/zip"
              @change="onPick"
            />
          </div>
        </div>

        <p v-if="problem !== ''" class="banner banner--error" role="alert">{{ problem }}</p>

        <p class="help">{{ EXPORT_FORMAT_HELP }}</p>

        <div class="actions">
          <HistoryExportGuide />

          <AppButton v-if="localDataAllowed" @click="importLocalData">Import from data/</AppButton>
        </div>
      </template>

      <ProgressBar v-if="status === STATUS.importing" class="importing" v-bind="progress" />

      <p class="footnote">
        Your export never leaves this browser. It is read on this device and kept in its local
        storage, where you can clear it again at any time.
      </p>
    </section>
  </main>
</template>

<style scoped>
.import {
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
  max-width: 620px;
  padding: 40px;
  border: 1px solid var(--hairline);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(232, 236, 230, 0.04), transparent 40%), var(--panel);
  box-shadow: 0 32px 64px -24px rgba(0, 0, 0, 0.8);

  @media (max-width: 1024px) {
    padding: 28px;
  }
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
.help,
.progress,
.footnote {
  font-size: 15px;
  line-height: 1.55;
  color: var(--fg-dim);
  margin: 0;
}

.pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin: 28px 0 0;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
}

.picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  border: 1px dashed rgba(232, 236, 230, 0.2);
  border-radius: 3px;
  cursor: pointer;
}

.picker:hover,
.picker:focus-within {
  border-color: var(--green);
  background: rgba(30, 215, 96, 0.06);
}

.picker__title {
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.picker__hint {
  font-size: 13px;
  color: var(--fg-dim);
}

.picker input {
  font: inherit;
  font-size: 12px;
  margin-top: 8px;
  color: var(--fg-dim);
  cursor: pointer;
}

.picker input::file-selector-button {
  font: inherit;
  font-size: 12px;
  padding: 6px 14px;
  margin-right: 10px;
  color: var(--fg);
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: 999px;
  cursor: pointer;
}

.progress {
  margin-top: 24px;
  font-family: var(--mono);
  font-size: 13px;
}

.importing {
  margin-top: 24px;
}

.help {
  margin-top: 20px;
  font-size: 13px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.banner {
  margin: 20px 0 0;
  padding: 12px 14px;
  border-left: 2px solid;
  border-radius: 0 3px 3px 0;
  font-size: 14px;
  line-height: 1.5;
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
</style>
