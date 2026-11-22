/**
 * Decides whether what the user picked looks like an Extended Streaming History
 * export, before the import pipeline spends a minute on it.
 *
 * Only the files *inside* are evidence. Spotify names the folder "Spotify
 * Extended Streaming History", but people rename it, and the zip arrives named
 * after the request rather than its contents — so the container proves nothing.
 */
import { EXPORT_FILE_PATTERN } from './manifest'

export const EXPORT_AUDIO_FILE_PATTERN = /^Streaming_History_Audio_.*\.json$/

export const EXPORT_FORMAT_HELP =
  'Pick the folder Spotify sent you, or the .zip it arrived in — either can be named ' +
  'anything. Inside, we look for files named like Streaming_History_Audio_2024.json.'

/** Separates "this is not an export" from "the import itself went wrong". */
export class ExportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportFormatError'
  }
}

/** Zip entries and picked folders carry a path; the pattern matches a name. */
export function exportFileName(path: string): string {
  return path.split('/').pop() ?? path
}

export function isExportFileName(path: string): boolean {
  return EXPORT_FILE_PATTERN.test(exportFileName(path))
}

function isAudioFileName(path: string): boolean {
  return EXPORT_AUDIO_FILE_PATTERN.test(exportFileName(path))
}

/** Null when these names look like an export. Takes already-matching names. */
export function findExportProblem(label: string, names: string[]): string | null {
  if (names.length === 0) return `No Spotify streaming-history files were found in ${label}.`
  if (!names.some(isAudioFileName)) {
    return `${label} holds video history but no audio history, so there are no listens to show.`
  }
  return null
}

const REQUIRED_PLAY_FIELDS = ['ts', 'ms_played']

/**
 * Catches a right-shaped folder full of wrong-shaped files — a renamed export
 * from another service, say — while the message can still name the file.
 */
export function findContentProblem(name: string, text: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return `${name} is not valid JSON.`
  }
  if (!Array.isArray(parsed)) return `${name} is not a list of plays.`
  // A year with nothing in it is legitimate; it just proves nothing either way.
  if (parsed.length === 0) return null
  return findFieldProblem(name, parsed[0])
}

function findFieldProblem(name: string, play: unknown): string | null {
  if (typeof play !== 'object' || play === null) return `${name} does not hold play records.`
  const missing = REQUIRED_PLAY_FIELDS.filter((field) => !(field in play))
  if (missing.length === 0) return null
  return `${name} has no ${missing.join(' or ')} field, so it is not streaming history.`
}
