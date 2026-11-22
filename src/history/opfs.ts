/**
 * Reads the origin-private filesystem directly, independently of DuckDB.
 *
 * DuckDB reporting an OPFS-backed database says only that `open()` succeeded.
 * This answers the separate question of whether bytes actually reached disk.
 */

interface DirectoryEntries {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

async function describeHandle(name: string, handle: FileSystemHandle): Promise<string> {
  if (handle.kind !== 'file') return `${name}/`
  try {
    const file = await (handle as FileSystemFileHandle).getFile()
    return `${name} ${file.size} bytes`
  } catch (error) {
    // An exclusive sync access handle held by DuckDB's worker blocks reads,
    // which still proves the file exists.
    return `${name} (locked: ${error instanceof Error ? error.name : 'unknown'})`
  }
}

/** Best effort: a file that is already gone is the outcome we wanted anyway. */
export async function removeOpfsFiles(names: string[]): Promise<void> {
  if (typeof navigator.storage?.getDirectory !== 'function') return
  const root = await navigator.storage.getDirectory()
  for (const name of names) {
    await root.removeEntry(name).catch(() => undefined)
  }
}

export async function describeOpfsRoot(): Promise<string> {
  if (typeof navigator.storage?.getDirectory !== 'function') return 'OPFS unavailable'
  try {
    const root = (await navigator.storage.getDirectory()) as FileSystemDirectoryHandle &
      DirectoryEntries
    const described: string[] = []
    for await (const [name, handle] of root.entries()) {
      described.push(await describeHandle(name, handle))
    }
    return described.length === 0 ? 'empty' : described.join(', ')
  } catch (error) {
    return `listing failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
