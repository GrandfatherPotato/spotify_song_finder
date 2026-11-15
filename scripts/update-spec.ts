/**
 * Refreshes the vendored Spotify OpenAPI spec.
 *
 * Run with `pnpm spec:update`. Downloads the upstream schema, reports whether
 * it changed, and regenerates the provenance sidecar plus the derived list of
 * deprecated operations that `src/spotify/deprecated.test.ts` enforces.
 *
 * Pass --check to fail instead of writing when upstream has moved on; that is
 * the form to put in CI when you want to be told the vendored copy is stale.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const SPEC_URL = 'https://developer.spotify.com/reference/web-api/open-api-schema.yaml'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_PATH = join(ROOT, 'vendor/spotify-openapi.yaml')
const META_PATH = join(ROOT, 'vendor/spotify-openapi.meta.json')
const DEPRECATED_PATH = join(ROOT, 'vendor/spotify-deprecated-operations.json')

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const

type Operation = { deprecated?: boolean; operationId?: string }
type PathItem = Partial<Record<(typeof HTTP_METHODS)[number], Operation>>
type Spec = {
  openapi?: string
  info?: { version?: string }
  paths?: Record<string, PathItem>
}
type DeprecatedOperation = { method: string; path: string; operationId: string | null }
type FullyDeprecatedPath = { path: string; operationIds: string[] }

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * `fullyDeprecatedPaths` is what the guard test matches against. Paths where
 * only some verbs are deprecated (`PUT`/`DELETE /me/tracks` are dead but
 * `GET /me/tracks` is not) are deliberately excluded: the test scans string
 * literals and cannot see which method a path is used with, so flagging them
 * would reject correct code.
 */
function collectOperations(spec: Spec): {
  deprecated: DeprecatedOperation[]
  fullyDeprecatedPaths: FullyDeprecatedPath[]
  total: number
} {
  const deprecated: DeprecatedOperation[] = []
  const fullyDeprecatedPaths: FullyDeprecatedPath[] = []
  let total = 0

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const operations = HTTP_METHODS.flatMap((method) => {
      const operation = item[method]
      return operation ? [{ method, operation }] : []
    })
    total += operations.length

    const dead = operations.filter(({ operation }) => operation.deprecated === true)
    for (const { method, operation } of dead) {
      deprecated.push({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? null,
      })
    }

    if (operations.length > 0 && dead.length === operations.length) {
      fullyDeprecatedPaths.push({
        path,
        operationIds: dead.map(({ operation }) => operation.operationId ?? '(unnamed)'),
      })
    }
  }

  return { deprecated, fullyDeprecatedPaths, total }
}

const checkOnly = process.argv.includes('--check')

const response = await fetch(SPEC_URL)
if (!response.ok) {
  console.error(`Failed to fetch spec: HTTP ${response.status}`)
  process.exit(1)
}
const incoming = await response.text()
const incomingHash = sha256(incoming)
const currentHash = sha256(readFileSync(SPEC_PATH, 'utf8'))

const changed = incomingHash !== currentHash

if (changed) {
  console.log('Upstream spec has changed.')
  console.log(`  vendored: ${currentHash.slice(0, 12)}…`)
  console.log(`  upstream: ${incomingHash.slice(0, 12)}…`)
} else {
  console.log(`Vendored spec is current (sha256 ${incomingHash.slice(0, 12)}…)`)
}

if (checkOnly) {
  if (!changed) process.exit(0)
  console.error('\nVendored spec is stale. Run `pnpm spec:update` and review the diff.')
  process.exit(1)
}

const spec: Spec = parse(incoming)
const { deprecated, fullyDeprecatedPaths, total } = collectOperations(spec)

// Derived files are rewritten every run so they can never drift from the spec,
// even if a previous run was interrupted after writing only the YAML.
if (changed) writeFileSync(SPEC_PATH, incoming)
writeFileSync(
  META_PATH,
  `${JSON.stringify(
    {
      url: SPEC_URL,
      sha256: incomingHash,
      fetchedAt: new Date().toISOString().slice(0, 10),
      specVersion: spec.info?.version ?? null,
      openapi: spec.openapi ?? null,
      pathCount: Object.keys(spec.paths ?? {}).length,
      operationCount: total,
      deprecatedOperationCount: deprecated.length,
      fullyDeprecatedPathCount: fullyDeprecatedPaths.length,
    },
    null,
    2,
  )}\n`,
)
writeFileSync(
  DEPRECATED_PATH,
  `${JSON.stringify({ operations: deprecated, fullyDeprecatedPaths }, null, 2)}\n`,
)

console.log(
  `Recorded ${deprecated.length}/${total} operations as deprecated, ` +
    `across ${fullyDeprecatedPaths.length} fully dead paths.`,
)
if (changed) console.log('Spec updated — now run `pnpm spec:types` and review `git diff`.')
