import { onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { HistoryDatabase } from '../history'
import { noExportSource } from '../history/export/source'
import { NOTICE, NOTICE_PARAM } from '../notices'
import { ROUTE_PATH } from '../routes'
import { useHistoryStore } from '../stores/history'

export const HISTORY_STATUS = {
  loading: 'loading',
  ready: 'ready',
  error: 'error',
} as const

export type HistoryStatus = (typeof HISTORY_STATUS)[keyof typeof HISTORY_STATUS]

const OPENING_MESSAGE = 'Opening your history…'

export interface UseHistoryDatabase {
  status: Ref<HistoryStatus>
  message: Ref<string>
}

/**
 * `load` runs with the open database before the page is declared ready, so a
 * query that throws lands in the error state rather than on an empty page.
 *
 * `HistoryView` deliberately does not use this: the query console re-opens
 * after clearing, reports timings and diagnostics, and has a `cleared` state
 * none of the reading pages want.
 */
export function useHistoryDatabase(
  load: (database: HistoryDatabase) => Promise<void>,
): UseHistoryDatabase {
  const router = useRouter()
  const history = useHistoryStore()
  const status = ref<HistoryStatus>(HISTORY_STATUS.loading)
  const message = ref(OPENING_MESSAGE)

  onMounted(async () => {
    if (!(await history.isStored())) {
      await router.replace({
        path: ROUTE_PATH.history,
        query: { [NOTICE_PARAM]: NOTICE.noHistory },
      })
      return
    }
    try {
      const database = await history.open(noExportSource(), (step) => {
        message.value = `${step.message} (${step.completed + 1}/${step.total})`
      })
      await load(database)
      status.value = HISTORY_STATUS.ready
    } catch (error) {
      message.value = error instanceof Error ? error.message : String(error)
      status.value = HISTORY_STATUS.error
    }
  })

  return { status, message }
}
