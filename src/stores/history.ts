import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { clearHistoryStorage, hasStoredSnapshot, openHistoryDatabase } from '../history'
import type { HistoryDatabase, ImportProgress } from '../history'
import type { ExportSource } from '../history/export/source'

type ProgressHandler = (progress: ImportProgress) => void

const ignoreProgress: ProgressHandler = () => undefined

export const useHistoryStore = defineStore('history', () => {
  const database = shallowRef<HistoryDatabase | null>(null)

  /**
   * Held outside the reactive state on purpose. Two views mounting in the same
   * tick must await one open, not start two imports over the same export.
   */
  let opening: Promise<HistoryDatabase> | null = null

  function open(
    source: ExportSource,
    onProgress: ProgressHandler = ignoreProgress,
  ): Promise<HistoryDatabase> {
    opening ??= openHistoryDatabase(source, onProgress)
      .then((opened) => {
        database.value = opened
        return opened
      })
      .catch((error: unknown) => {
        opening = null
        throw error
      })
    return opening
  }

  async function reset(): Promise<void> {
    const pending = opening
    opening = null
    const handle = pending === null ? null : await pending.catch(() => null)
    database.value = null
    await clearHistoryStorage(handle)
  }

  async function isStored(): Promise<boolean> {
    return database.value !== null || (await hasStoredSnapshot())
  }

  return { database, open, reset, isStored }
})
