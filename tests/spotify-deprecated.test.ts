import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import deprecated from '../vendor/spotify-deprecated-operations.json' with { type: 'json' }

/**
 * Half of Spotify's documented operations carry `deprecated: true`, including
 * several an assistant would reach for by instinct (`/recommendations`,
 * `/audio-features`, `/playlists/{id}/tracks`). Prose rules in
 * docs/spotify-api-context.md are advisory; this makes them fail the build.
 *
 * Only paths whose every verb is deprecated are matched — see the note in
 * scripts/update-spec.ts for why partially-deprecated paths are excluded.
 *
 * Lives outside src/ because it reads the filesystem: src/ is typed for the
 * browser and has no Node globals.
 */

const { fullyDeprecatedPaths } = deprecated
const SRC = join(import.meta.dirname, '../src')
const SCANNED_EXTENSIONS = ['.ts', '.vue']
// Generated types legitimately name every path, including the dead ones.
const EXCLUDED = ['types/spotify.ts']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) return []
    if (EXCLUDED.includes(relative(SRC, full))) return []
    return [full]
  })
}

/** `/playlists/{playlist_id}/tracks` -> matches `/playlists/37i9dQ/tracks`. */
function pathToPattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+')
  return new RegExp(`^${escaped}$`)
}

function stringLiterals(source: string): string[] {
  return [...source.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n$]*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  )
}

describe('Spotify endpoint usage', () => {
  it('has a non-empty deprecated-path list to check against', () => {
    expect(fullyDeprecatedPaths.length).toBeGreaterThan(0)
  })

  it('excludes paths that still have a live verb', () => {
    const paths = fullyDeprecatedPaths.map((entry) => entry.path)

    expect(paths).toContain('/recommendations')
    expect(paths).not.toContain('/me/tracks')
  })

  it('references no deprecated Spotify operation', () => {
    const patterns = fullyDeprecatedPaths.map((entry) => ({
      ...entry,
      pattern: pathToPattern(entry.path),
    }))

    const violations = sourceFiles(SRC).flatMap((file) =>
      stringLiterals(readFileSync(file, 'utf8'))
        .map((literal) => literal.replace(/^https:\/\/api\.spotify\.com\/v1/, ''))
        .flatMap((literal) =>
          patterns
            .filter((entry) => entry.pattern.test(literal))
            .map(
              (entry) => `${relative(SRC, file)}: "${literal}" is ${entry.operationIds.join(', ')}`,
            ),
        ),
    )

    expect(violations).toEqual([])
  })
})
