import type { components, paths } from '../types/spotify'
import { getValidAccessToken, refreshStoredTokens } from './auth'
import { SpotifyApiError } from './errors'

type CurrentUser = paths['/me']['get']['responses'][200]['content']['application/json']
type ExternalUrls = components['schemas']['ExternalUrlObject']
type Image = components['schemas']['ImageObject']
type ErrorEnvelope = components['responses']['Unauthorized']['content']['application/json']
type ErrorBody = components['schemas']['ErrorObject']

const ME_PATH: keyof paths = '/me'

const API_BASE = 'https://api.spotify.com/v1'

// Rate limits run over a rolling 30s window, so a Retry-After beyond this is
// not worth blocking a page render on — surface it to the user instead.
const MAX_RETRY_AFTER_SECONDS = 30
const DEFAULT_RETRY_AFTER_SECONDS = 3

const NOT_SIGNED_IN = 'You are not signed in to Spotify.'
const SESSION_EXPIRED = 'Your Spotify session expired. Sign in again.'
const MALFORMED_PROFILE = 'Spotify returned a profile this app could not read.'

export interface SpotifyUser {
  id: string
  displayName: string
  profileUrl: string | null
  imageUrl: string | null
}

export async function fetchCurrentUser(): Promise<SpotifyUser> {
  return parseUser(await spotifyGet(ME_PATH))
}

export async function spotifyGet(path: string): Promise<unknown> {
  const response = await sendAuthorised(path)
  if (!response.ok) throw await toApiError(response)

  return response.json()
}

async function sendAuthorised(path: string): Promise<Response> {
  const accessToken = await getValidAccessToken()
  if (accessToken === null) throw new SpotifyApiError(NOT_SIGNED_IN, 401)

  const response = await requestWithRateLimitRetry(path, accessToken)
  if (response.status !== 401) return response

  const refreshed = await refreshStoredTokens()
  if (refreshed === null) throw new SpotifyApiError(SESSION_EXPIRED, 401)

  return requestWithRateLimitRetry(path, refreshed.accessToken)
}

async function requestWithRateLimitRetry(path: string, accessToken: string): Promise<Response> {
  const response = await request(path, accessToken)
  if (response.status !== 429) return response

  const retryAfterSeconds = readRetryAfterSeconds(response)
  if (retryAfterSeconds > MAX_RETRY_AFTER_SECONDS) return response

  await delay(retryAfterSeconds * 1000)
  return request(path, accessToken)
}

function request(path: string, accessToken: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

function readRetryAfterSeconds(response: Response): number {
  const header = response.headers.get('Retry-After')
  const parsed = header === null ? Number.NaN : Number.parseInt(header, 10)

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RETRY_AFTER_SECONDS
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function toApiError(response: Response): Promise<SpotifyApiError> {
  const detail = await readErrorDetail(response)
  const summary = describeStatus(response.status)

  return new SpotifyApiError(detail === null ? summary : `${summary} (${detail})`, response.status)
}

function describeStatus(status: number): string {
  if (status >= 500) return 'Spotify is having trouble right now. Try again shortly.'

  const known: Record<number, string | undefined> = {
    400: 'Spotify could not understand that request.',
    401: SESSION_EXPIRED,
    403:
      'Spotify refused the request. This app runs in development mode, so your account must be ' +
      'added under Users Management in the Spotify Developer Dashboard.',
    404: 'Spotify could not find that resource — it may not be available in your market.',
    429: 'Spotify rate limit reached. Wait a moment and try again.',
  }

  return known[status] ?? `Spotify returned an unexpected error (HTTP ${status}).`
}

async function readErrorDetail(response: Response): Promise<string | null> {
  const payload: unknown = await response.json().catch(() => null)
  const error = readField<ErrorEnvelope>(payload, 'error')
  const message = readField<ErrorBody>(error, 'message')

  return typeof message === 'string' && message !== '' ? message : null
}

function readField<T>(payload: unknown, key: keyof T & string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined

  return (payload as Record<string, unknown>)[key]
}

function parseUser(payload: unknown): SpotifyUser {
  const id = readField<CurrentUser>(payload, 'id')
  if (typeof id !== 'string') throw new SpotifyApiError(MALFORMED_PROFILE)

  const displayName = readField<CurrentUser>(payload, 'display_name')

  return {
    id,
    displayName: typeof displayName === 'string' ? displayName : id,
    profileUrl: readSpotifyUrl(readField<CurrentUser>(payload, 'external_urls')),
    imageUrl: readImageUrl(readField<CurrentUser>(payload, 'images')),
  }
}

function readSpotifyUrl(value: unknown): string | null {
  const url = readField<ExternalUrls>(value, 'spotify')

  return typeof url === 'string' ? url : null
}

function readImageUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null

  const url = value
    .map((image: unknown) => readField<Image>(image, 'url'))
    .find((candidate): candidate is string => typeof candidate === 'string')

  return url ?? null
}
