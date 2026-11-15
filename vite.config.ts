import vue from '@vitejs/plugin-vue'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vite'
// Explicit .ts extension: this file is type-checked under `moduleResolution:
// nodenext` (tsconfig.node.json), which requires it. src/env.ts imports the
// same module extensionless because src/ resolves in bundler mode.
import { buildEnvSchema, envSchema, parseEnv } from './env/schema.ts'

/**
 * Reads the dotenv files Vite would read, in Vite's own precedence order
 * (`.env.local` wins over `.env`), without mutating `process.env`.
 */
function readDotenvFiles(): Record<string, string> {
  const parsed: Record<string, string> = {}
  loadDotenv({ path: ['.env.local', '.env'], processEnv: parsed, quiet: true })
  return parsed
}

export default defineConfig(({ command }) => {
  // Validate before the bundle is produced: a build with no client ID is a
  // defect, while a dev server without one is a state the app renders for.
  const isBuild = command === 'build'
  parseEnv(readDotenvFiles(), '.env.local / .env', isBuild ? buildEnvSchema : envSchema)

  return {
    plugins: [vue()],
    server: {
      // Spotify rejects `localhost` in redirect URIs but allows the loopback
      // literal, so the dev server must bind 127.0.0.1 to match the URI
      // registered in the Developer Dashboard.
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  }
})
