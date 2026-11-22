/**
 * Shared between the browser and the dev-server middleware in `vite.config.ts`,
 * which is why this holds constants only and imports nothing.
 */
export const HISTORY_MANIFEST_PATH = '/__history-manifest'

export const HISTORY_DATA_DIR = 'data'

export const EXPORT_FILE_PATTERN = /^Streaming_History_.*\.json$/

export interface HistoryManifest {
  files: Array<{ name: string; url: string; bytes: number }>
}
