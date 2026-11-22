import { describe, expect, it } from 'vitest'
// Explicit .ts extension: tests/ is type-checked under `moduleResolution:
// nodenext` (tsconfig.node.json), which requires it.
import { APP_ENV, buildEnvSchema, envSchema, parseEnv } from '../env/schema.ts'

const CLIENT_ID = '0123456789abcdef0123456789abcdef'

describe('envSchema', () => {
  it('fails closed to hosted when the app environment is unset or blank', () => {
    expect(envSchema.parse({}).VITE_APP_ENV).toBe(APP_ENV.hosted)
    expect(envSchema.parse({ VITE_APP_ENV: '  ' }).VITE_APP_ENV).toBe(APP_ENV.hosted)
  })

  it('accepts local, which unlocks the data/ import', () => {
    expect(envSchema.parse({ VITE_APP_ENV: 'local' }).VITE_APP_ENV).toBe(APP_ENV.local)
  })

  it('rejects an app environment it does not know', () => {
    expect(envSchema.safeParse({ VITE_APP_ENV: 'staging' }).success).toBe(false)
  })

  it('accepts an absent client ID — the app renders a not-configured state', () => {
    expect(envSchema.safeParse({}).success).toBe(true)
  })

  it('treats a blank client ID as absent rather than as an empty string', () => {
    const result = envSchema.parse({ VITE_SPOTIFY_CLIENT_ID: '   ' })

    expect(result.VITE_SPOTIFY_CLIENT_ID).toBeUndefined()
  })

  it('trims surrounding whitespace off the client ID', () => {
    const result = envSchema.parse({ VITE_SPOTIFY_CLIENT_ID: `  ${CLIENT_ID}  ` })

    expect(result.VITE_SPOTIFY_CLIENT_ID).toBe(CLIENT_ID)
  })

  it('rejects a localhost redirect URI, which Spotify refuses', () => {
    const result = envSchema.safeParse({
      VITE_SPOTIFY_REDIRECT_URI: 'http://localhost:5173/callback',
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('localhost')
  })

  it('accepts the loopback literal', () => {
    const result = envSchema.safeParse({
      VITE_SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:5173/callback',
    })

    expect(result.success).toBe(true)
  })

  it('reports a non-URL redirect rather than throwing out of the refinement', () => {
    // Zod 4 runs refinements even after an earlier check fails, so a refine
    // that assumed `new URL()` would succeed used to throw a TypeError here.
    const result = envSchema.safeParse({ VITE_SPOTIFY_REDIRECT_URI: 'not-a-url' })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toContain('absolute URL')
  })
})

describe('buildEnvSchema', () => {
  it('requires a client ID, unlike the runtime schema', () => {
    expect(buildEnvSchema.safeParse({}).success).toBe(false)
    expect(buildEnvSchema.safeParse({ VITE_SPOTIFY_CLIENT_ID: CLIENT_ID }).success).toBe(true)
  })

  it('rejects a blank client ID', () => {
    expect(buildEnvSchema.safeParse({ VITE_SPOTIFY_CLIENT_ID: '' }).success).toBe(false)
  })
})

describe('parseEnv', () => {
  it('names the origin and every failing variable in one error', () => {
    expect(() => parseEnv({ VITE_SPOTIFY_REDIRECT_URI: 'nope' }, '.env.test')).toThrow(
      /Invalid environment \(\.env\.test\)[\s\S]*VITE_SPOTIFY_REDIRECT_URI/,
    )
  })

  it('returns the parsed values when valid', () => {
    expect(parseEnv({ VITE_SPOTIFY_CLIENT_ID: CLIENT_ID }, 'test')).toEqual({
      VITE_APP_ENV: APP_ENV.hosted,
      VITE_SPOTIFY_CLIENT_ID: CLIENT_ID,
      VITE_SPOTIFY_REDIRECT_URI: undefined,
    })
  })
})
