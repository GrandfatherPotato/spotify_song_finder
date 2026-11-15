export interface SpotifyTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scope: string
}

export const TOKENS_KEY = 'spotify.tokens'

export function readStoredTokens(): SpotifyTokens | null {
  const raw = sessionStorage.getItem(TOKENS_KEY)
  if (raw === null) return null

  try {
    return parseStoredTokens(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeStoredTokens(tokens: SpotifyTokens): void {
  sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function clearStoredTokens(): void {
  sessionStorage.removeItem(TOKENS_KEY)
}

export function hasStoredTokens(): boolean {
  return readStoredTokens() !== null
}

function parseStoredTokens(value: unknown): SpotifyTokens | null {
  if (typeof value !== 'object' || value === null) return null

  const { accessToken, refreshToken, expiresAt, scope } = value as Record<string, unknown>
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null
  if (typeof expiresAt !== 'number' || typeof scope !== 'string') return null

  return { accessToken, refreshToken, expiresAt, scope }
}
