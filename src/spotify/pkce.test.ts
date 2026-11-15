import { describe, expect, it } from 'vitest'
import { deriveCodeChallenge, generateRandomString } from './pkce'

describe('generateRandomString', () => {
  it('produces a string of the requested length', () => {
    expect(generateRandomString(64)).toHaveLength(64)
  })

  it('uses only unreserved characters', () => {
    expect(generateRandomString(128)).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('does not repeat itself', () => {
    expect(generateRandomString(64)).not.toBe(generateRandomString(64))
  })
})

describe('deriveCodeChallenge', () => {
  it('base64url-encodes the SHA-256 digest of the verifier', async () => {
    expect(await deriveCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })

  it('emits no base64 padding or non-url-safe characters', async () => {
    expect(await deriveCodeChallenge(generateRandomString(64))).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('is deterministic for a given verifier', async () => {
    const verifier = generateRandomString(64)

    expect(await deriveCodeChallenge(verifier)).toBe(await deriveCodeChallenge(verifier))
  })
})
