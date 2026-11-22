# Backtrack

Retrace what you've listened to. Two ways in, both running entirely in your own browser:

- **Finder** — search the Spotify catalogue, then follow a track's Last.fm labels to others that
  sound like it, ranked against what you already listen to.
- **History** — load your Extended Streaming History export and explore years of plays: what you
  returned to, what you dropped, and when. No Spotify account needed.

Nothing is uploaded. The export is parsed, stored and queried on your machine; if you connect
Spotify, the access token lives in the tab and nowhere else.

The idea is exploratory rather than product-shaped. Pull down what the Web API offers — your top
artists and tracks, saved songs, genre labels on artists — and see what can be built from it.

## What's actually possible

Worth knowing up front, because it shapes the whole project: **Spotify switched off its
recommendation and audio-analysis endpoints for apps registered after 27 November 2024.** This app
is new, so these are permanently unavailable:

- Get Recommendations
- Get Audio Features — tempo, energy, danceability, valence
- Get Audio Analysis
- Get Related Artists
- Featured and category playlists

That removes the obvious shortcut. There is no "give me songs like this one" call, and no
numeric feature vector to cluster on. Anything resembling recommendation has to be built here, out
of what remains:

| Source                                 | Endpoint                                       |
| -------------------------------------- | ---------------------------------------------- |
| Catalogue search                       | `GET /search`                                  |
| Your top artists and tracks            | `GET /me/top/{type}`                           |
| Recently played                        | `GET /me/player/recently-played`               |
| Saved tracks                           | `GET /me/tracks`                               |
| Your playlists                         | `GET /me/playlists`                            |
| Artist details, incl. **genre labels** | `GET /artists/{id}`                            |
| Artist albums / album tracks           | `GET /artists/{id}/albums`, `GET /albums/{id}` |
| Create a playlist                      | `POST /me/playlists`                           |
| Add tracks to it                       | `POST /playlists/{id}/items`                   |

The genre strings on artist objects are the main "label" left to work with, alongside popularity,
release dates and your own listening history. Constraint as feature: the interesting part is now
the heuristic you invent, not the endpoint you call.

Roughly half of the operations in Spotify's OpenAPI spec are marked `deprecated`, mostly because
of a shape migration (`/users/{user_id}/playlists` → `/me/playlists`, `/playlists/{id}/tracks` →
`/playlists/{id}/items`). Check the spec before using an endpoint — see
[`docs/spotify-api-context.md`](docs/spotify-api-context.md).

## Status

Early. Authentication works end to end; the data exploration is the part still to be written.

- Authorization Code with PKCE login, token storage and refresh
- A typed API client with error handling
- `GET /me` wired up as the first call

## Getting started

### Prerequisites

Node and pnpm are pinned exactly and managed by [mise](https://mise.jdx.dev):

```bash
mise install          # installs Node 26.13.1 and pnpm 12.15.0
pnpm install
```

If mise isn't activated in your shell, prefix commands with `mise exec --`.

### Spotify app setup

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add `http://127.0.0.1:5173/callback` as a redirect URI. It must match exactly — and Spotify
   rejects `localhost`, so the loopback literal is required.
3. Copy the Client ID. There is no client secret: PKCE doesn't need one, and a browser app
   couldn't keep it secret anyway.
4. Under **User Management**, add the Spotify account you'll log in with. Apps in development mode
   are limited to 5 allowlisted users, and anyone else gets a `403`.

```bash
cp .env.example .env.local   # then paste your Client ID in
pnpm dev                     # http://127.0.0.1:5173
```

Open the `127.0.0.1` URL rather than `localhost`, or the redirect URI won't match.

## Scripts

| Command            | Does                                            |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Dev server with HMR                             |
| `pnpm build`       | Type-check then production build                |
| `pnpm preview`     | Serve the built output                          |
| `pnpm test`        | Run the test suite                              |
| `pnpm test:watch`  | Tests in watch mode                             |
| `pnpm lint`        | Type-check + Prettier + ESLint                  |
| `pnpm lint:fix`    | The same, writing fixes                         |
| `pnpm spec:update` | Refresh the vendored Spotify OpenAPI spec       |
| `pnpm spec:check`  | Fail if the vendored spec is stale              |
| `pnpm spec:types`  | Regenerate `src/types/spotify.ts` from the spec |

## Layout

```
env/schema.ts       zod schema for env vars, shared by the browser and the build
src/spotify/        auth (PKCE), tokens, API client, config, errors
src/components/     Vue components
src/types/spotify.ts  generated from the OpenAPI spec — do not edit
vendor/             Spotify's OpenAPI spec, vendored with a checksum
scripts/            spec refresh and type generation
tests/              repo-level guards (env schema, deprecated endpoints)
docs/               Spotify API rules and constraints
```

The OpenAPI spec is committed rather than fetched so the exact schema is always to hand, and a test
fails the build if any code references an endpoint Spotify has retired.

## Notes

- Vue 3 + Vite + TypeScript, pnpm, every dependency pinned to an exact version
- Conventional commits, enforced by commitlint; lint and type-check run on commit via husky
- `.env` and `.env.local` are gitignored and must stay that way
- [`CLAUDE.md`](CLAUDE.md) holds the conventions, for humans and agents alike
