import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { config as loadDotenv } from 'dotenv'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import {
  EXPORT_FILE_PATTERN,
  HISTORY_DATA_DIR,
  HISTORY_MANIFEST_PATH,
} from './src/history/export/manifest.ts'
import type { HistoryManifest } from './src/history/export/manifest.ts'
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

function findExportFiles(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...findExportFiles(path))
    else if (EXPORT_FILE_PATTERN.test(name)) found.push(path)
  }
  return found
}

function buildManifest(): HistoryManifest {
  return {
    files: findExportFiles(HISTORY_DATA_DIR)
      .sort()
      .map((path) => ({
        name: relative(HISTORY_DATA_DIR, path),
        url: `/${path.split('/').map(encodeURIComponent).join('/')}`,
        bytes: statSync(path).size,
      })),
  }
}

/**
 * Lists `data/` for the dev server only. The export is gitignored and nearly
 * 200 MB, so it is never globbed into a bundle — the browser fetches the files
 * Vite already serves from the project root.
 */
function historyManifestPlugin(): Plugin {
  return {
    name: 'history-manifest',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(HISTORY_MANIFEST_PATH, (_request, response) => {
        const manifest = existsSync(HISTORY_DATA_DIR) ? buildManifest() : { files: [] }
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(manifest))
      })
    },
  }
}

export default defineConfig(({ command }) => {
  // Validate before the bundle is produced: a build with no client ID is a
  // defect, while a dev server without one is a state the app renders for.
  const isBuild = command === 'build'
  parseEnv(readDotenvFiles(), '.env.local / .env', isBuild ? buildEnvSchema : envSchema)

  return {
    plugins: [vue(), historyManifestPlugin()],
    // duckdb-wasm ships its own workers and wasm; prebundling mangles them.
    optimizeDeps: { exclude: ['@duckdb/duckdb-wasm'] },
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
