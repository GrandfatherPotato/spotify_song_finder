# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Keep This File Concise

**MANDATORY**: This file must stay under 200 lines. If a topic needs more depth, move it to `docs/<topic>-context.md` and leave a one-line pointer here.

## Project Overview

A Vue 3 + Vite + TypeScript single-page app for finding songs via the Spotify Web API. Single package, pnpm, no monorepo.

- **Frontend**: Vue 3 (`<script setup>` SFCs), Vite, TypeScript
- **Package manager**: pnpm only — never `npm` or `yarn` (the pre-commit hook rejects their lockfiles)
- **Tooling**: ESLint 10 flat config, Prettier, Husky + lint-staged + commitlint

## CRITICAL: Task Completion Verification

**MANDATORY**: Before claiming any task is "complete" or "done":

1. **Run `pnpm lint`** — type-check, Prettier and ESLint must all pass
2. **Run `pnpm test`** — all tests must pass
3. **Show proof** — paste the command output demonstrating success
4. **Verify no regressions** — existing behaviour still works

**FORBIDDEN**:

- Saying "done" without running verification commands
- Declaring success based on code changes alone
- Using phrases like "should work" or "this will fix it"

**FAILURE TO VERIFY = INCOMPLETE TASK**

## Development Commands

- `pnpm dev` — Vite dev server with HMR
- `pnpm build` — type-check then production build
- `pnpm preview` — serve the production build locally
- `pnpm lint` — type-check + Prettier check + ESLint (**run before every commit**)
- `pnpm lint:fix` — type-check + Prettier write + ESLint --fix
- `pnpm type-check` — `vue-tsc -b` alone
- `pnpm format` — Prettier write (never use `npx prettier` directly)
- `pnpm test` — run the test suite once
- `pnpm test:watch` — watch mode while developing
- `pnpm spec:update` — refresh the vendored Spotify OpenAPI spec and its derived data
- `pnpm spec:check` — fail if the vendored spec has gone stale (for CI)
- `pnpm spec:types` — regenerate `src/types/spotify.ts` from the vendored spec

## Toolchain and Dependencies

**Node and pnpm are pinned to exact versions** in `mise.toml`, mirrored in `package.json` `engines`/`packageManager`. `engineStrict` is on, so pnpm refuses to install under any other Node.

- **Run `mise install` once** after cloning. If mise is not activated in your shell, prefix commands: `mise exec -- pnpm test`
- **ALL dependencies are pinned to exact versions** — no `^` or `~`, ever. `saveExact: true` in `pnpm-workspace.yaml` enforces this on `pnpm add`
- **pnpm 12 reads settings from `pnpm-workspace.yaml`**, not `.npmrc` and not the `pnpm` field in `package.json` — both are silently ignored
- **Prefer the newest release of everything**; when something must lag, pin it and leave a comment saying what blocks the upgrade
  - `typescript` is held at `6.0.3` because `vue-tsc` has no TypeScript 7 support yet (TS 7 dropped the `./lib/tsc` subpath export). Retry on the next `vue-tsc` release
- When adding a dependency, **always run `pnpm install` before testing or building**

## Environment Variables

- **`env/schema.ts` is the single source of truth.** Adding a variable means adding it there — nowhere else
- **Client code imports `env` from `src/env.ts`**, never `import.meta.env` directly
- **`dotenv` is build-time only.** It reads the filesystem and cannot run in the browser; Vite already loads `.env*` and exposes `VITE_`-prefixed values on `import.meta.env`. `vite.config.ts` uses dotenv to validate before producing a bundle
- Two schemas, deliberately: `envSchema` allows an absent client ID because the app renders a not-configured state, while `buildEnvSchema` requires one because shipping without it is a defect. `pnpm dev` tolerates it; `pnpm build` fails
- **Only `VITE_`-prefixed names reach the client, in plaintext. Never put a secret in the schema**

## Code Quality Standards

- **ALWAYS run `pnpm lint` before declaring work complete** — and fix warnings, not just errors
- **NEVER add `eslint-disable` comments** — fix the underlying issue. If genuinely unavoidable, a description is mandatory (`@eslint-community/eslint-comments/require-description`): `// eslint-disable-next-line <rule> -- <why>`
- **NEVER write code comments unless the user explicitly asks for them** — code should explain itself through naming. Exceptions: tooling-required comments, and a comment explaining _why_ a non-obvious constraint exists
- **ALWAYS place imports at the top of the file**, before any other code
- **Prefer `unknown` over `any`** — `unknown` forces narrowing before use. Note the lint rule is deliberately off here, so this is on you to uphold
- **Prefer parsing over asserting** — validate external data (Spotify API responses) into typed values rather than reaching for `as`. Type assertions are permitted here but are a smell on untrusted input
- **Use British English** throughout code, comments and documentation
- **NEVER repeat a string literal — name it once and import it.** A value written in two places is a value that will disagree in two places. Applies to storage keys, status/state values, protocol values, endpoint paths and user-facing messages
  - Unions come from a `const` object, not a bare type: `const STATUS = { busy: 'busy', ... } as const` then `type Status = (typeof STATUS)[keyof typeof STATUS]`. `enum` is unavailable — `erasableSyntaxOnly` is on
  - **Export the constant if a test needs it.** A test that retypes `'spotify.tokens'` passes while the source says something else
  - **Exception: wire values asserted in tests stay literal.** `expect(body.get('grant_type')).toBe('authorization_code')` must hardcode what Spotify expects — importing the same constant the source uses would assert only that the code equals itself

### Enforced by ESLint — don't fight these

`complexity` max 10, `max-statements` 15, `max-depth` 4 — if you hit one, the function wants splitting, not a disable comment. Also enforced: `@typescript-eslint/consistent-type-imports`, `no-non-null-assertion`, `no-param-reassign`, `@typescript-eslint/no-shadow`, `eqeqeq`, `prefer-template`, `object-shorthand`, `no-nested-ternary`, `import/no-duplicates`.

Formatting is Prettier's job, not yours or ESLint's: 2-space indent, no semicolons, single quotes, 100-column width, trailing commas.

## Testing

- **CRITICAL**: Always use `pnpm test` — never `npx vitest` or `npm test`
- **ALWAYS run relevant tests before committing** — the pre-commit hook does not run them for you
- **ALWAYS add or update tests when changing behaviour** — a bug fix without a regression test is incomplete
- **NEVER use `if`/`else`/ternary in test bodies** — every test follows a single deterministic path; assert expected values directly
- **NEVER introduce `.skip`** — fix the root cause
- Tests live beside the code as `*.test.ts` (or `*.spec.ts`), next to the unit under test
- Stack: Vitest + Testing Library (`@testing-library/vue`) in a jsdom environment
- Mock the network at the boundary — never let a test hit the real Spotify API

## Git Workflow

- **Conventional commits are enforced** by commitlint on `commit-msg`: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. A non-conforming message is rejected outright
- The `pre-commit` hook runs lint-staged (type-check → `eslint --fix` → `prettier --write`) over staged files
- **NEVER use `--no-verify`** to bypass hooks

**CRITICAL Git Safety:**

- **ALWAYS run `git status` before `git checkout`** — never revert files without checking first
- **NEVER use `git checkout` to revert new files** — files marked `A` (added) are permanently deleted by checkout
- If `git diff --stat` shows unexpected files, stop and report before committing
- Don't commit files meant to be ignored — run `git status` before every commit
- Before any `git push`, verify branch, remote and the expected diff

## Spotify API and Secrets

**MANDATORY**: Read `docs/spotify-api-context.md` before writing any code that touches `api.spotify.com`. It carries the full rules — OAuth flow, redirect URIs, scopes, rate limits, error handling and a review checklist.

The four that bite hardest:

- **NEVER guess endpoints or field names** — grep the vendored spec at `vendor/spotify-openapi.yaml`, and import generated types from `src/types/spotify.ts`. Do not `WebFetch` the upstream schema; the local copy is authoritative and exact
- **Half the API is deprecated** (48 of 96 operations). Confirm an operation has no `deprecated: true` before using it. `pnpm test` fails on references to fully-dead paths
- **Recommendations, Audio Features and Audio Analysis are unavailable to this app** (restricted for apps registered after 27 Nov 2024). Discovery must be built on Search, the user's library and their playlists
- **NEVER put a Spotify client secret in this repo.** `VITE_`-prefixed env vars are inlined into the bundle in plaintext — a client _ID_ is fine, a _secret_ is not. **NEVER commit `.env*` files** with real credentials
- **Authorization Code with PKCE** for user data; never Implicit Grant. Redirect URIs use `127.0.0.1`, never `localhost`

## Solution Shape and Change Footprint

- **✅ REQUIRED**: Every touched file traces to the stated intent — make the narrowest change that satisfies it
- **❌ FORBIDDEN**: New abstractions, layers or undeclared refactors without a checkable reason
- **Before modifying a function, check for siblings sharing the same concern** — extract a shared helper so changes land once
- When reviewing a diff, review only the diff — do not "improve" surrounding code

## Clarification Behaviour

- If an instruction is ambiguous or could be read multiple ways, ask before acting
- When the user says "it" or "that" and there are multiple possible referents, confirm which
- Prefer doing less and asking over doing more and being wrong

## Additional Information Lookups

- **Spotify Web API**: Read `docs/spotify-api-context.md`
  - When: **always**, before any code touching `api.spotify.com` — auth, search, playlists, playback, token handling
  - Contains: OpenAPI source of truth, restricted endpoints, PKCE flow, redirect URI rules, scopes, token storage and refresh, rate limits and quota mode, error handling, review checklist

- **Extended Streaming History import**: Read `docs/streaming-history-context.md`
  - When: **always**, before any code that parses, stores or queries a user's streaming history export
  - Contains: real export schema (the bundled PDF is stale), URI-vs-name track identity, DuckDB-WASM schema and storage decision, worker import pipeline and its memory trap, query conventions, privacy rules, build phasing, review checklist
