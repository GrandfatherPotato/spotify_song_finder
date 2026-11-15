import { parseEnv } from '../env/schema'
import type { Env } from '../env/schema'

/**
 * Validated environment for client code. Import `env` from here rather than
 * touching `import.meta.env` directly — this is the only place that reads it,
 * so a missing or malformed variable fails once, loudly, with a message that
 * says what to fix.
 *
 * Vite performs the dotenv loading (`.env`, `.env.local`, `.env.[mode]`) and
 * exposes the `VITE_`-prefixed results on `import.meta.env`. The `dotenv`
 * package itself cannot run here — it reads the filesystem.
 */
export const env: Env = parseEnv(import.meta.env, 'import.meta.env')
