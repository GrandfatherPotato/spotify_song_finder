import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentUser } from './api'
import { SpotifyApiError } from './errors'
import { writeStoredTokens } from './tokens'

const NOW = 1_700_000_000_000
const ME_ENDPOINT = 'https://api.spotify.com/v1/me'

const fetchMock = vi.fn()

const profilePayload = {
  id: 'wizzler',
  display_name: 'JM Wizzler',
  external_urls: { spotify: 'https://open.spotify.com/user/wizzler' },
  images: [{ url: 'https://i.scdn.co/image/avatar.jpg', height: 300, width: 300 }],
  type: 'user',
  uri: 'spotify:user:wizzler',
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function signIn(): void {
  writeStoredTokens({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: NOW + 3_600_000,
    scope: 'user-read-private',
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-123')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5173/callback')
})

afterEach(() => {
  fetchMock.mockReset()
  sessionStorage.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchCurrentUser', () => {
  it('calls GET /me with a bearer token', async () => {
    signIn()
    fetchMock.mockResolvedValue(jsonResponse(profilePayload))

    await fetchCurrentUser()

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(ME_ENDPOINT)
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer access-1')
  })

  it('maps the profile onto the fields this app displays', async () => {
    signIn()
    fetchMock.mockResolvedValue(jsonResponse(profilePayload))

    expect(await fetchCurrentUser()).toEqual({
      id: 'wizzler',
      displayName: 'JM Wizzler',
      profileUrl: 'https://open.spotify.com/user/wizzler',
      imageUrl: 'https://i.scdn.co/image/avatar.jpg',
    })
  })

  it('falls back to the user ID when display_name is null', async () => {
    signIn()
    fetchMock.mockResolvedValue(
      jsonResponse({ id: 'wizzler', display_name: null, images: [], external_urls: {} }),
    )

    const user = await fetchCurrentUser()

    expect(user.displayName).toBe('wizzler')
    expect(user.imageUrl).toBeNull()
    expect(user.profileUrl).toBeNull()
  })

  it('exposes none of the fields the spec marks deprecated', async () => {
    signIn()
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...profilePayload,
        country: 'SE',
        email: 'test@example.com',
        product: 'premium',
        followers: { href: null, total: 10 },
        explicit_content: { filter_enabled: false, filter_locked: false },
      }),
    )

    expect(Object.keys(await fetchCurrentUser()).sort()).toEqual([
      'displayName',
      'id',
      'imageUrl',
      'profileUrl',
    ])
  })

  it('rejects a response without an id rather than asserting a type onto it', async () => {
    signIn()
    fetchMock.mockResolvedValue(jsonResponse({ display_name: 'Nobody' }))

    await expect(fetchCurrentUser()).rejects.toThrow(/could not read/)
  })

  it('refuses to call Spotify when signed out', async () => {
    await expect(fetchCurrentUser()).rejects.toThrow(/not signed in/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('error handling', () => {
  beforeEach(signIn)

  it('refreshes once and retries after a 401, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { status: 401 } }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-2', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(profilePayload))

    expect((await fetchCurrentUser()).id).toBe('wizzler')

    const [retryUrl, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(retryUrl).toBe(ME_ENDPOINT)
    expect(new Headers(retryInit.headers).get('Authorization')).toBe('Bearer access-2')
  })

  it('gives up after a failed refresh instead of looping', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { status: 401 } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_grant' }, 400))

    await expect(fetchCurrentUser()).rejects.toThrow(/session expired/i)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explains a 403 as the development-mode allowlist', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { status: 403, message: 'User not registered' } }, 403),
    )

    await expect(fetchCurrentUser()).rejects.toThrow(/Users Management/)
  })

  it('includes Spotify’s own message alongside the explanation', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { status: 404, message: 'Not found.' } }, 404),
    )

    await expect(fetchCurrentUser()).rejects.toThrow(/Not found\./)
  })

  it('waits out Retry-After on a 429 and retries once', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { status: 429 } }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse(profilePayload))

    const pending = fetchCurrentUser()
    await vi.advanceTimersByTimeAsync(2000)

    expect((await pending).id).toBe('wizzler')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not block on a Retry-After beyond the rate-limit window', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { status: 429 } }, 429, { 'Retry-After': '600' }),
    )

    await expect(fetchCurrentUser()).rejects.toThrow(/rate limit/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a 5xx as a transient Spotify problem', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { status: 503 } }, 503))

    const error = await fetchCurrentUser().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SpotifyApiError)
    expect((error as SpotifyApiError).status).toBe(503)
    expect((error as SpotifyApiError).message).toMatch(/having trouble/)
  })
})
