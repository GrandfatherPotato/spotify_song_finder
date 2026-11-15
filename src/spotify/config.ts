export interface SpotifyConfig {
  clientId: string
  redirectUri: string
}

export const SPOTIFY_SCOPES = ['user-read-private']

const DEFAULT_CALLBACK_PATH = '/callback'

export function readSpotifyConfig(): SpotifyConfig | null {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (typeof clientId !== 'string' || clientId.trim() === '') return null

  return { clientId: clientId.trim(), redirectUri: resolveRedirectUri() }
}

function resolveRedirectUri(): string {
  const configured = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()

  return `${window.location.origin}${DEFAULT_CALLBACK_PATH}`
}

export function findRedirectUriProblem(redirectUri: string): string | null {
  const parsed = tryParseUrl(redirectUri)
  if (parsed === null) return `“${redirectUri}” is not a valid redirect URI.`

  // Spotify allows the loopback literal for local development but rejects the
  // `localhost` hostname outright, and matching is exact rather than fuzzy.
  if (parsed.hostname === 'localhost') {
    return 'Spotify rejects “localhost” redirect URIs. Open the app on http://127.0.0.1:5173 instead.'
  }

  return null
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}
