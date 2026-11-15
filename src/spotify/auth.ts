import type { SpotifyConfig } from './config'
import { SPOTIFY_SCOPES, findRedirectUriProblem, readSpotifyConfig } from './config'
import { SpotifyAuthError } from './errors'
import { deriveCodeChallenge, generateRandomString } from './pkce'
import type { SpotifyTokens } from './tokens'
import { clearStoredTokens, readStoredTokens, writeStoredTokens } from './tokens'

const AUTHORIZE_ENDPOINT = 'https://accounts.spotify.com/authorize'
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'

export const PKCE_VERIFIER_KEY = 'spotify.pkce.verifier'
export const PKCE_STATE_KEY = 'spotify.pkce.state'

const VERIFIER_LENGTH = 64
const STATE_LENGTH = 16

const RESPONSE_TYPE_CODE = 'code'
const CALLBACK_CODE_PARAM = 'code'
const CALLBACK_STATE_PARAM = 'state'
const CALLBACK_ERROR_PARAM = 'error'
const CODE_CHALLENGE_METHOD_S256 = 'S256'
const GRANT_AUTHORIZATION_CODE = 'authorization_code'
const GRANT_REFRESH_TOKEN = 'refresh_token'
const AUTHORIZE_ERROR_ACCESS_DENIED = 'access_denied'

const EXPIRY_SKEW_MS = 60_000

const MISSING_CONFIG =
  'No Spotify client ID configured. Copy .env.example to .env.local and set VITE_SPOTIFY_CLIENT_ID.'
const MALFORMED_TOKEN_RESPONSE = 'Spotify returned a token response this app could not read.'
const INCOMPLETE_CALLBACK = 'That sign-in link is incomplete. Start the sign-in again.'
const STATE_MISMATCH = 'Sign-in state did not match. Start the sign-in again.'
const SIGN_IN_CANCELLED = 'You cancelled the Spotify sign-in.'

export function hasAuthCallback(search: string): boolean {
  const params = new URLSearchParams(search)

  return params.has(CALLBACK_CODE_PARAM) || params.has(CALLBACK_ERROR_PARAM)
}

export async function buildAuthorizeUrl(): Promise<string> {
  const config = requireConfig()
  const codeVerifier = generateRandomString(VERIFIER_LENGTH)
  const state = generateRandomString(STATE_LENGTH)

  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier)
  sessionStorage.setItem(PKCE_STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: RESPONSE_TYPE_CODE,
    redirect_uri: config.redirectUri,
    scope: SPOTIFY_SCOPES.join(' '),
    [CALLBACK_STATE_PARAM]: state,
    code_challenge_method: CODE_CHALLENGE_METHOD_S256,
    code_challenge: await deriveCodeChallenge(codeVerifier),
  })

  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`
}

export async function beginLogin(): Promise<void> {
  window.location.assign(await buildAuthorizeUrl())
}

export async function completeLogin(search: string): Promise<SpotifyTokens> {
  const params = new URLSearchParams(search)
  const authorizeError = params.get(CALLBACK_ERROR_PARAM)
  if (authorizeError !== null) throw new SpotifyAuthError(describeAuthorizeError(authorizeError))

  const code = params.get(CALLBACK_CODE_PARAM)
  const expectedState = sessionStorage.getItem(PKCE_STATE_KEY)
  const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  clearPkceState()

  if (code === null || codeVerifier === null) throw new SpotifyAuthError(INCOMPLETE_CALLBACK)
  if (expectedState === null || params.get(CALLBACK_STATE_PARAM) !== expectedState) {
    throw new SpotifyAuthError(STATE_MISMATCH)
  }

  const config = requireConfig()
  const tokens = await exchange(
    new URLSearchParams({
      grant_type: GRANT_AUTHORIZATION_CODE,
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    }),
    null,
  )

  writeStoredTokens(tokens)
  return tokens
}

export async function refreshStoredTokens(): Promise<SpotifyTokens | null> {
  const stored = readStoredTokens()
  const config = readSpotifyConfig()
  if (stored === null || config === null) return null

  try {
    const refreshed = await exchange(
      new URLSearchParams({
        grant_type: GRANT_REFRESH_TOKEN,
        refresh_token: stored.refreshToken,
        client_id: config.clientId,
      }),
      stored.refreshToken,
    )
    writeStoredTokens(refreshed)
    return refreshed
  } catch {
    clearStoredTokens()
    return null
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const stored = readStoredTokens()
  if (stored === null) return null
  if (stored.expiresAt - EXPIRY_SKEW_MS > Date.now()) return stored.accessToken

  const refreshed = await refreshStoredTokens()
  return refreshed === null ? null : refreshed.accessToken
}

export function logOut(): void {
  clearStoredTokens()
  clearPkceState()
}

function requireConfig(): SpotifyConfig {
  const config = readSpotifyConfig()
  if (config === null) throw new SpotifyAuthError(MISSING_CONFIG)

  const problem = findRedirectUriProblem(config.redirectUri)
  if (problem !== null) throw new SpotifyAuthError(problem)

  return config
}

function clearPkceState(): void {
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(PKCE_STATE_KEY)
}

async function exchange(
  body: URLSearchParams,
  fallbackRefreshToken: string | null,
): Promise<SpotifyTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) throw new SpotifyAuthError(describeTokenFailure(payload, response.status))

  return parseTokens(payload, fallbackRefreshToken)
}

function parseTokens(payload: unknown, fallbackRefreshToken: string | null): SpotifyTokens {
  if (typeof payload !== 'object' || payload === null) {
    throw new SpotifyAuthError(MALFORMED_TOKEN_RESPONSE)
  }

  const fields = payload as Record<string, unknown>
  const accessToken = fields.access_token
  const expiresIn = fields.expires_in
  if (typeof accessToken !== 'string' || typeof expiresIn !== 'number') {
    throw new SpotifyAuthError(MALFORMED_TOKEN_RESPONSE)
  }

  // A refresh response may omit refresh_token; Spotify's guidance is to keep
  // using the existing one rather than treating the session as dead.
  const refreshToken =
    typeof fields.refresh_token === 'string' ? fields.refresh_token : fallbackRefreshToken
  if (refreshToken === null) throw new SpotifyAuthError(MALFORMED_TOKEN_RESPONSE)

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof fields.scope === 'string' ? fields.scope : '',
  }
}

function describeTokenFailure(payload: unknown, status: number): string {
  const description = readStringField(payload, 'error_description')
  if (description !== null) return `Spotify rejected the sign-in: ${description}`

  const code = readStringField(payload, 'error')
  if (code !== null) return `Spotify rejected the sign-in (${code}).`

  return `Spotify rejected the sign-in (HTTP ${status}).`
}

function describeAuthorizeError(code: string): string {
  if (code === AUTHORIZE_ERROR_ACCESS_DENIED) return SIGN_IN_CANCELLED

  return `Spotify refused the sign-in (${code}).`
}

function readStringField(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null) return null

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}
