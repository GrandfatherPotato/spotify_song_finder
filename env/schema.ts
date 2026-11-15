import { z } from 'zod'

/**
 * Single source of truth for this app's environment variables.
 *
 * Deliberately free of Node and Vite imports so both sides can share it:
 * `src/env.ts` validates `import.meta.env` in the browser, and
 * `vite.config.ts` validates the dotenv-loaded values at build time.
 *
 * Only `VITE_`-prefixed names are readable from client code — Vite strips
 * everything else — and whatever is here is inlined into the bundle in
 * plaintext. Never add a secret to this schema.
 */

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Vite yields `''` for a declared-but-blank variable; treat that as absent. */
const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().optional(),
)

/**
 * Every variable is optional here, and that is deliberate: the app renders a
 * "not configured yet" state when the client ID is absent, so a blank value is
 * a supported way to run `pnpm dev`. What this schema rejects is a *malformed*
 * value — a non-URL redirect, or the `localhost` hostname Spotify refuses.
 *
 * Presence is enforced separately by `buildEnvSchema`, because shipping a
 * production bundle with no client ID is a real defect rather than a state.
 */
export const envSchema = z.object({
  VITE_SPOTIFY_CLIENT_ID: optionalText,

  VITE_SPOTIFY_REDIRECT_URI: optionalText.pipe(
    z
      .url('Must be an absolute URL, e.g. http://127.0.0.1:5173/callback.')
      // Zod 4 still runs refinements after an earlier check fails, so this
      // must not assume `value` parses — `new URL()` would throw out of the
      // schema instead of reporting the `z.url()` failure.
      .refine((value) => tryParseUrl(value)?.hostname !== 'localhost', {
        error:
          'Spotify rejects “localhost” redirect URIs. Use http://127.0.0.1:5173/callback instead.',
      })
      .optional(),
  ),
})

/** Adds the presence requirements that only apply to a production build. */
const CLIENT_ID_REQUIRED =
  'Required for a production build. Spotify Dashboard → your app → Settings → Client ID.'

export const buildEnvSchema = envSchema.extend({
  // The message is set on both the type check and the length check: without
  // the former, an absent variable falls back to Zod's "expected string,
  // received undefined", which does not tell you where to get the value.
  VITE_SPOTIFY_CLIENT_ID: z.string({ error: CLIENT_ID_REQUIRED }).trim().min(1, CLIENT_ID_REQUIRED),
})

export type Env = z.infer<typeof envSchema>

/** `VITE_SPOTIFY_CLIENT_ID: Missing. …` — one line per failing variable. */
export function formatEnvIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

export function parseEnv(source: unknown, origin: string, schema: z.ZodType<Env> = envSchema): Env {
  const result = schema.safeParse(source)
  if (result.success) return result.data

  throw new Error(
    `Invalid environment (${origin}):\n${formatEnvIssues(result.error)}\n\n` +
      'Copy .env.example to .env.local and fill in the values.',
  )
}
