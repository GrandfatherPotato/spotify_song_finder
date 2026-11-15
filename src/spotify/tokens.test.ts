import { afterEach, describe, expect, it } from 'vitest'
import type { SpotifyTokens } from './tokens'
import {
  TOKENS_KEY,
  clearStoredTokens,
  hasStoredTokens,
  readStoredTokens,
  writeStoredTokens,
} from './tokens'

const tokens: SpotifyTokens = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1_700_000_000_000,
  scope: 'user-read-private',
}

afterEach(() => {
  sessionStorage.clear()
})

describe('token storage', () => {
  it('round-trips tokens through sessionStorage', () => {
    writeStoredTokens(tokens)

    expect(readStoredTokens()).toEqual(tokens)
    expect(hasStoredTokens()).toBe(true)
  })

  it('never writes to localStorage', () => {
    writeStoredTokens(tokens)

    expect(localStorage.getItem(TOKENS_KEY)).toBeNull()
  })

  it('returns null when nothing is stored', () => {
    expect(readStoredTokens()).toBeNull()
    expect(hasStoredTokens()).toBe(false)
  })

  it('returns null for unparsable JSON', () => {
    sessionStorage.setItem(TOKENS_KEY, 'not json')

    expect(readStoredTokens()).toBeNull()
  })

  it('returns null when a required field has the wrong type', () => {
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify({ ...tokens, expiresAt: 'soon' }))

    expect(readStoredTokens()).toBeNull()
  })

  it('forgets tokens when cleared', () => {
    writeStoredTokens(tokens)
    clearStoredTokens()

    expect(readStoredTokens()).toBeNull()
  })
})
