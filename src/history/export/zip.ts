/**
 * Pulls the history files out of a zip, leaving the rest of it packed.
 *
 * The filter is what keeps this affordable: fflate decompresses matched entries
 * into memory all at once, and the export ships a multi-megabyte PDF we would
 * otherwise be holding. The matched JSON does stay resident until the source is
 * dropped — a picked folder reads lazily off disk instead, so it is the cheaper
 * route for a very large export.
 */
import { unzip } from 'fflate'
import type { Unzipped } from 'fflate'
import type { ExportFile } from './source'
import { exportFileName, isExportFileName } from './validate'

const ZIP_NAME_PATTERN = /\.zip$/i

export function isZipFile(file: File): boolean {
  return ZIP_NAME_PATTERN.test(file.name)
}

function unzipMatching(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, { filter: (entry) => isExportFileName(entry.name) }, (error, unzipped) => {
      if (error === null) resolve(unzipped)
      else reject(new Error(`Could not read that zip: ${error.message}`))
    })
  })
}

export async function unzipExportFiles(zip: File): Promise<ExportFile[]> {
  const unzipped = await unzipMatching(new Uint8Array(await zip.arrayBuffer()))
  const decoder = new TextDecoder()
  return Object.entries(unzipped).map(([path, bytes]) => ({
    name: exportFileName(path),
    bytes: bytes.length,
    readText: async () => decoder.decode(bytes),
  }))
}
