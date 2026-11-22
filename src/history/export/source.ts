import { EXPORT_FILE_PATTERN, HISTORY_MANIFEST_PATH } from './manifest'
import type { HistoryManifest } from './manifest'

/**
 * One `Streaming_History_*.json` file, read on demand. The import pipeline
 * consumes this interface and never learns where the bytes came from, so an
 * uploaded zip or a picked folder can supply it without the pipeline changing.
 */
export interface ExportFile {
  name: string
  bytes: number
  readText: () => Promise<string>
}

export interface ExportSource {
  label: string
  listFiles: () => Promise<ExportFile[]>
}

async function fetchText(url: string, name: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Could not read ${name}: ${response.status}`)
  return response.text()
}

/** Reads the gitignored `data/` directory the dev server exposes. */
export function devDataSource(): ExportSource {
  return {
    label: 'data/ (dev server)',
    listFiles: async () => {
      const response = await fetch(HISTORY_MANIFEST_PATH)
      if (!response.ok) throw new Error(`Manifest unavailable: ${response.status}`)
      const manifest = (await response.json()) as HistoryManifest
      return manifest.files.map((file) => ({
        name: file.name,
        bytes: file.bytes,
        readText: () => fetchText(file.url, file.name),
      }))
    },
  }
}

/** Reads files the user picked, from a folder input or a drag-and-drop. */
export function fileListSource(files: File[], label?: string): ExportSource {
  const matching = files.filter((file) => EXPORT_FILE_PATTERN.test(file.name))
  return {
    label: label ?? `${matching.length} selected files`,
    listFiles: async () =>
      matching.map((file) => ({
        name: file.name,
        bytes: file.size,
        readText: () => file.text(),
      })),
  }
}

/**
 * Stands in where a source is structurally required but must never be read: a
 * restore from the saved snapshot never touches the export. Reaching this means
 * the snapshot was gone, so the caller should be asking for a file instead.
 */
export function noExportSource(): ExportSource {
  return {
    label: 'no export selected',
    listFiles: () => Promise.reject(new Error('No export has been selected yet')),
  }
}
