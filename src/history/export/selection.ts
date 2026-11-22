/**
 * Turns whatever the user picked — a zip, a folder, or loose files — into an
 * ExportSource, refusing anything that does not look like an export first.
 */
import { fileListSource } from './source'
import type { ExportSource } from './source'
import {
  ExportFormatError,
  findContentProblem,
  findExportProblem,
  isExportFileName,
} from './validate'
import { isZipFile, unzipExportFiles } from './zip'

/** A folder input reports every file's path relative to the folder picked. */
function folderLabel(files: File[]): string {
  const [root] = (files[0]?.webkitRelativePath ?? '').split('/')
  return root === '' ? `the ${files.length} selected files` : root
}

function pickedFilesSource(selected: File[]): ExportSource {
  const label = folderLabel(selected)
  if (!selected.some((file) => isExportFileName(file.name))) {
    throw new ExportFormatError(`No Spotify streaming-history files were found in ${label}.`)
  }
  return fileListSource(selected, label)
}

async function zipSource(zip: File): Promise<ExportSource> {
  const files = await unzipExportFiles(zip)
  return { label: zip.name, listFiles: async () => files }
}

async function assertLooksLikeExport(source: ExportSource): Promise<void> {
  const files = await source.listFiles()
  const problem = findExportProblem(
    source.label,
    files.map((file) => file.name),
  )
  if (problem !== null) throw new ExportFormatError(problem)
  const [first] = files
  const contentProblem = findContentProblem(first.name, await first.readText())
  if (contentProblem !== null) throw new ExportFormatError(contentProblem)
}

export async function selectedExportSource(selected: File[]): Promise<ExportSource> {
  if (selected.length === 0) throw new ExportFormatError('Nothing was selected.')
  const zip = selected.find(isZipFile)
  const source = zip === undefined ? pickedFilesSource(selected) : await zipSource(zip)
  await assertLooksLikeExport(source)
  return source
}
