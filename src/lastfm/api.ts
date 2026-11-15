import { env } from '../env'
import { LastFmError } from './errors'

const API_BASE = 'https://ws.audioscrobbler.com/2.0/'
const FORMAT_JSON = 'json'

export const AUTOCORRECT_ON = '1'

export const LAST_FM_METHODS = {
  trackTopTags: 'track.gettoptags',
  artistTopTags: 'artist.gettoptags',
  artistSimilar: 'artist.getsimilar',
  trackSimilar: 'track.getsimilar',
  tagTopTracks: 'tag.gettoptracks',
  artistTopTracks: 'artist.gettoptracks',
} as const

export type LastFmMethod = (typeof LAST_FM_METHODS)[keyof typeof LAST_FM_METHODS]

const NOT_CONFIGURED =
  'No Last.fm API key configured. Copy .env.example to .env.local and set VITE_LAST_FM_API_KEY.'
const MALFORMED_RESPONSE = 'Last.fm returned a response this app could not read.'

// Last.fm reports failures in the body and is inconsistent about the HTTP
// status, so the body is parsed before the status is trusted.
const ERROR_INVALID_KEY = 10
const ERROR_SUSPENDED_KEY = 26
const ERROR_RATE_LIMITED = 29

export function isLastFmConfigured(): boolean {
  return env.VITE_LAST_FM_API_KEY !== undefined
}

export async function lastFmGet(
  method: LastFmMethod,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const apiKey = env.VITE_LAST_FM_API_KEY
  if (apiKey === undefined) throw new LastFmError(NOT_CONFIGURED)

  const response = await fetch(buildUrl(method, params, apiKey))
  const payload: unknown = await response.json().catch(() => null)

  if (typeof payload !== 'object' || payload === null) {
    throw new LastFmError(MALFORMED_RESPONSE, response.ok ? null : response.status)
  }

  const body = payload as Record<string, unknown>
  const code = typeof body.error === 'number' ? body.error : null
  if (code !== null) throw new LastFmError(describeCode(code, body.message), code)

  return body
}

function buildUrl(method: LastFmMethod, params: Record<string, string>, apiKey: string): URL {
  const url = new URL(API_BASE)
  url.searchParams.set('method', method)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('format', FORMAT_JSON)

  return url
}

function describeCode(code: number, message: unknown): string {
  const known: Record<number, string | undefined> = {
    [ERROR_INVALID_KEY]: 'Last.fm rejected the API key. Check VITE_LAST_FM_API_KEY.',
    [ERROR_SUSPENDED_KEY]: 'This Last.fm API key has been suspended.',
    [ERROR_RATE_LIMITED]: 'Last.fm rate limit reached. Wait a moment and try again.',
  }

  if (known[code] !== undefined) return known[code]

  return typeof message === 'string' && message !== ''
    ? `Last.fm error ${code}: ${message}`
    : `Last.fm error ${code}.`
}
