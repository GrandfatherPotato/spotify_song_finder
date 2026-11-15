import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PKCE_STATE_KEY,
  PKCE_VERIFIER_KEY,
  buildAuthorizeUrl,
  completeLogin,
  getValidAccessToken,
  hasAuthCallback,
  logOut,
  refreshStoredTokens,
} from './auth'
import { readStoredTokens, writeStoredTokens } from './tokens'

const NOW = 1_700_000_000_000
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
const REDIRECT_URI = 'http://127.0.0.1:5173/callback'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastRequestBody(): URLSearchParams {
  const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]

  return new URLSearchParams(String(init.body))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-123')
  vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', REDIRECT_URI)
})

afterEach(() => {
  fetchMock.mockReset()
  sessionStorage.clear()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('hasAuthCallback', () => {
  it('detects an authorisation code', () => {
    expect(hasAuthCallback('?code=abc&state=xyz')).toBe(true)
  })

  it('detects an authorisation error', () => {
    expect(hasAuthCallback('?error=access_denied')).toBe(true)
  })

  it('ignores an unrelated query string', () => {
    expect(hasAuthCallback('?q=nirvana')).toBe(false)
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds a PKCE authorisation request with the minimum scope', async () => {
    const url = new URL(await buildAuthorizeUrl())

    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  // Spelled out rather than imported from SPOTIFY_SCOPES: importing the same
  // constant the source uses would assert only that the code equals itself,
  // and a scope added "just in case" is exactly what this should catch.
  it('requests only the three scopes the features need', async () => {
    const url = new URL(await buildAuthorizeUrl())

    expect(url.searchParams.get('scope')).toBe(
      'user-read-private user-top-read user-read-recently-played',
    )
  })

  it('stores the verifier and state so the callback can be verified', async () => {
    const url = new URL(await buildAuthorizeUrl())

    expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toHaveLength(64)
    expect(url.searchParams.get('state')).toBe(sessionStorage.getItem(PKCE_STATE_KEY))
  })

  it('never leaks the verifier into the authorisation request', async () => {
    const url = new URL(await buildAuthorizeUrl())

    expect(url.searchParams.has('code_verifier')).toBe(false)
    expect(url.searchParams.get('code_challenge')).not.toBe(
      sessionStorage.getItem(PKCE_VERIFIER_KEY),
    )
  })

  it('refuses to start without a client ID', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '')

    await expect(buildAuthorizeUrl()).rejects.toThrow(/VITE_SPOTIFY_CLIENT_ID/)
  })

  it('refuses a localhost redirect URI that Spotify would reject', async () => {
    vi.stubEnv('VITE_SPOTIFY_REDIRECT_URI', 'http://localhost:5173/callback')

    await expect(buildAuthorizeUrl()).rejects.toThrow(/127\.0\.0\.1/)
  })
})

describe('completeLogin', () => {
  beforeEach(() => {
    sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier-abc')
    sessionStorage.setItem(PKCE_STATE_KEY, 'state-xyz')
  })

  it('exchanges the code and stores the tokens in sessionStorage', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        access_token: 'access-1',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-1',
        scope: 'user-read-private',
      }),
    )

    const tokens = await completeLogin('?code=code-1&state=state-xyz')

    expect(tokens.accessToken).toBe('access-1')
    expect(tokens.expiresAt).toBe(NOW + 3_600_000)
    expect(readStoredTokens()).toEqual(tokens)
  })

  it('sends the verifier and redirect URI Spotify requires', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'a', expires_in: 3600, refresh_token: 'r' }),
    )

    await completeLogin('?code=code-1&state=state-xyz')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(TOKEN_ENDPOINT)
    expect(lastRequestBody().get('grant_type')).toBe('authorization_code')
    expect(lastRequestBody().get('code')).toBe('code-1')
    expect(lastRequestBody().get('code_verifier')).toBe('verifier-abc')
    expect(lastRequestBody().get('redirect_uri')).toBe(REDIRECT_URI)
    expect(lastRequestBody().has('client_secret')).toBe(false)
  })

  it('clears the one-shot PKCE state afterwards', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'a', expires_in: 3600, refresh_token: 'r' }),
    )

    await completeLogin('?code=code-1&state=state-xyz')

    expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull()
    expect(sessionStorage.getItem(PKCE_STATE_KEY)).toBeNull()
  })

  it('rejects a mismatched state without calling the token endpoint', async () => {
    await expect(completeLogin('?code=code-1&state=forged')).rejects.toThrow(/state did not match/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a cancelled authorisation in plain language', async () => {
    await expect(completeLogin('?error=access_denied')).rejects.toThrow(/cancelled/)
  })

  it('surfaces the description Spotify gives for a rejected exchange', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'invalid_grant', error_description: 'code expired' }, 400),
    )

    await expect(completeLogin('?code=code-1&state=state-xyz')).rejects.toThrow(/code expired/)
  })

  it('rejects a token response missing an access token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ expires_in: 3600, refresh_token: 'r' }))

    await expect(completeLogin('?code=code-1&state=state-xyz')).rejects.toThrow(/could not read/)
  })
})

describe('refreshStoredTokens', () => {
  beforeEach(() => {
    writeStoredTokens({
      accessToken: 'access-old',
      refreshToken: 'refresh-old',
      expiresAt: NOW + 1000,
      scope: 'user-read-private',
    })
  })

  it('persists a rotated refresh token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ access_token: 'access-new', expires_in: 3600, refresh_token: 'refresh-new' }),
    )

    const refreshed = await refreshStoredTokens()

    expect(refreshed?.refreshToken).toBe('refresh-new')
    expect(readStoredTokens()?.refreshToken).toBe('refresh-new')
  })

  it('keeps the existing refresh token when the response omits one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'access-new', expires_in: 3600 }))

    const refreshed = await refreshStoredTokens()

    expect(refreshed?.accessToken).toBe('access-new')
    expect(refreshed?.refreshToken).toBe('refresh-old')
  })

  it('sends the PKCE refresh body with no client secret', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'access-new', expires_in: 3600 }))

    await refreshStoredTokens()

    expect(lastRequestBody().get('grant_type')).toBe('refresh_token')
    expect(lastRequestBody().get('refresh_token')).toBe('refresh-old')
    expect(lastRequestBody().get('client_id')).toBe('client-123')
    expect(lastRequestBody().has('client_secret')).toBe(false)
  })

  it('drops the session when the refresh token is rejected', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400))

    expect(await refreshStoredTokens()).toBeNull()
    expect(readStoredTokens()).toBeNull()
  })

  it('returns null when there is nothing to refresh', async () => {
    sessionStorage.clear()

    expect(await refreshStoredTokens()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getValidAccessToken', () => {
  it('reuses a token that is comfortably within its lifetime', async () => {
    writeStoredTokens({
      accessToken: 'access-fresh',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3_600_000,
      scope: 'user-read-private',
    })

    expect(await getValidAccessToken()).toBe('access-fresh')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes ahead of expiry rather than waiting for a 401', async () => {
    writeStoredTokens({
      accessToken: 'access-stale',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 30_000,
      scope: 'user-read-private',
    })
    fetchMock.mockResolvedValue(jsonResponse({ access_token: 'access-new', expires_in: 3600 }))

    expect(await getValidAccessToken()).toBe('access-new')
  })

  it('returns null when signed out', async () => {
    expect(await getValidAccessToken()).toBeNull()
  })
})

describe('logOut', () => {
  it('removes tokens and any in-flight PKCE state', () => {
    writeStoredTokens({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: NOW,
      scope: '',
    })
    sessionStorage.setItem(PKCE_VERIFIER_KEY, 'verifier-abc')

    logOut()

    expect(readStoredTokens()).toBeNull()
    expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull()
  })
})
