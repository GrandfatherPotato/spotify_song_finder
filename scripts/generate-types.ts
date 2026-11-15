/**
 * Generates `src/types/spotify.ts` from the vendored OpenAPI spec.
 *
 * Run with `pnpm spec:types`. The vendored YAML carries Spotify's
 * `x-spotify-policy` vendor extension, which `$ref`s an external
 * `../policies.yaml` that Spotify does not publish (404). openapi-typescript
 * resolves every $ref and fails hard on it, so this strips those extension
 * keys into a throwaway copy before codegen. `vendor/spotify-openapi.yaml`
 * stays byte-identical to upstream so its checksum keeps verifying.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, stringify } from 'yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_PATH = join(ROOT, 'vendor/spotify-openapi.yaml')
const TMP_DIR = join(ROOT, 'node_modules/.tmp')
const SANITISED_PATH = join(TMP_DIR, 'spotify-openapi.sanitised.yaml')
const OUT_PATH = join(ROOT, 'src/types/spotify.ts')

function stripPolicyExtensions(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripPolicyExtensions)
  if (node === null || typeof node !== 'object') return node
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('x-spotify-policy')) continue
    result[key] = stripPolicyExtensions(value)
  }
  return result
}

const spec = parse(readFileSync(SPEC_PATH, 'utf8'))
const sanitised = stripPolicyExtensions(spec)

mkdirSync(TMP_DIR, { recursive: true })
writeFileSync(SANITISED_PATH, stringify(sanitised))

const result = spawnSync('openapi-typescript', [SANITISED_PATH, '-o', OUT_PATH], {
  stdio: 'inherit',
  shell: true,
})
process.exit(result.status ?? 1)
