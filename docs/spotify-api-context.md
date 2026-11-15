# Spotify Web API Context

Rules for working against the Spotify Web API in this repo. Derived from Spotify's own
[Building with AI](https://developer.spotify.com/documentation/web-api/tutorials/building-with-ai)
guidance, which exists because assistants reliably hallucinate Spotify endpoints and field names.

Read this before writing any code that touches `api.spotify.com`.

## Source of Truth

**The spec is vendored at `vendor/spotify-openapi.yaml` — grep it, do not fetch it.**

- **NEVER guess endpoint paths, query parameters, or response field names.** Model knowledge of this API is both stale and confidently wrong
- At ~7,500 lines it is far too large to read whole. Grep for the path or `operationId` and read that block
- **Do not `WebFetch` the upstream URL** — that route summarises the schema through another model and quietly loses the exact field names, which is the one thing you need from it
- `vendor/spotify-openapi.meta.json` records the source URL, `sha256` and fetch date. `pnpm spec:update` refreshes it; `pnpm spec:check` fails if the vendored copy has gone stale
- **Generated types live in `src/types/spotify.ts`** (`pnpm spec:types`). Import from there so a wrong field name fails `pnpm type-check` instead of becoming a runtime `undefined`. Never hand-edit it
- Base URI for every request: `https://api.spotify.com/v1`
- If the spec and this file disagree, the spec wins — fix this file

## CRITICAL: Restricted Endpoints

On **27 November 2024** Spotify cut off eight endpoint groups for all apps registered from that date onward. This app is new, so **these are permanently unavailable to us** — they are not a "request access later" problem:

1. Get Recommendations
2. Get Audio Features
3. Get Audio Analysis
4. Get Related Artists
5. Get Featured Playlists
6. Get Category's Playlists
7. 30-second `preview_url` values in multi-get responses
8. Algorithmic and Spotify-owned editorial playlists

**This matters more here than in most projects** — "find me a song" reaches instinctively for Recommendations and Audio Features (tempo, energy, danceability, valence). Both are gone. Build discovery on **Search**, the user's own library, their playlists, and artist/album navigation instead.

**❌ FORBIDDEN**: writing code against any endpoint above, or proposing a feature that depends on one, without first telling the user it cannot work.

### Genre labels are empty, not merely deprecated

The spec marks these fields `deprecated: true`, which does not say whether they still carry data. Probed live on **15 November 2026** with a real user token: **0 of 5 artists returned a genre**, across both mainstream and niche (The Weeknd, Nirvana, Nick Cave & The Bad Seeds, Ethel Cain, 16 Horsepower).

- `TrackObject` has **no `genres` field at all** — it never has
- `AlbumObject.genres` is deprecated and documented as "The array is always empty"
- `ArtistObject.genres` is deprecated and **comes back empty in practice**

`GET /artists/{id}` is itself live and returns `200` — the field is dead, not the endpoint. Search is unaffected, and its `genre:` filter still works for querying _by_ a label even though no label can be read _off_ a track.

**❌ FORBIDDEN**: proposing any label, genre or "similar in style" feature sourced from Spotify. The vocabulary has to come from elsewhere, and MusicBrainz is not it — recording-level `genres`/`tags` are empty there too, and one song maps to many recording MBIDs. Last.fm `track.getTopTags` is the practical source: per-track tags, `access-control-allow-origin: *`, and only a public `api_key`.

### Most deprecations are a shape migration, not a removal

Separately from the restrictions above, Spotify has been renaming endpoints and marking the old
shape `deprecated`. The capability still exists — reach for the new path:

| Deprecated                                   | Use instead             |
| -------------------------------------------- | ----------------------- |
| `GET/POST/PUT/DELETE /playlists/{id}/tracks` | `/playlists/{id}/items` |
| `POST /users/{user_id}/playlists`            | `POST /me/playlists`    |
| `GET /users/{user_id}/playlists`             | `GET /me/playlists`     |
| `GET /users/{user_id}`                       | `GET /me`               |

The pattern: **`/users/{user_id}/…` → `/me/…`, and `…/tracks` → `…/items`.** Before concluding
that a capability is gone, look for the renamed form — `POST /me/playlists` (`create-playlist`) is
live even though `POST /users/{user_id}/playlists` (`create-playlist-for-user`) is not.

### The restriction list is not the whole problem

The spec marks **48 of its 96 operations** `deprecated: true` — half the API, reaching well past the eight groups above into `GET /tracks`, `GET /albums`, `GET /artists`, `GET /markets` and `GET /browse/new-releases`. Picking an endpoint by instinct is close to a coin flip.

**So check, don't recall**: grep the operation in `vendor/spotify-openapi.yaml` and confirm it has no `deprecated: true` before using it.

`tests/spotify-deprecated.test.ts` enforces this — it fails the build if any string literal under `src/` matches one of the 31 paths whose every verb is deprecated. Paths with a surviving verb (`GET /me/tracks` is live, `PUT`/`DELETE` are not) are excluded, so the guard cannot catch a dead _verb_ on a live path. That one is still on you.

## Authorisation

- **Use Authorization Code with PKCE** for anything touching user data. This is the only correct flow for a browser SPA with no backend
- **Client Credentials** is for public catalogue data only — it cannot access user data, and it needs a client secret, so it requires a backend. Do not use it from the browser
- **❌ NEVER use Implicit Grant.** It is deprecated and insecure
- **Request the minimum scopes** the feature needs. Adding a scope "just in case" is a review failure
  - Common ones here: `user-read-private`, `user-library-read`, `playlist-read-private`, `playlist-modify-private`
- Searching the public catalogue needs **no scope** — just a valid token

### Redirect URIs

- **HTTPS only**, with exactly one exception: loopback literal IP for local development
- **✅ `http://127.0.0.1:5173/callback`**
- **❌ `http://localhost:5173/callback`** — Spotify rejects `localhost` outright

`vite.config.ts` pins `server.host` to `127.0.0.1` with `strictPort: true`, so the dev server binds the loopback literal and never silently moves to another port behind the registered URI's back.

⚠️ **That config does not stop you browsing to `localhost:5173`** — `localhost` resolves to `127.0.0.1`, so the same dev server answers on both names. Vite prints the `127.0.0.1` URL; use it. Loading the app via `localhost` makes the browser send a `localhost` redirect URI, which Spotify rejects.

Register the exact URI (scheme, host, port, path) in the Spotify Developer Dashboard — matching is exact, not fuzzy.

## Tokens and Secrets

- **❌ NEVER put the client secret in this repo or any client-side code.** Vite inlines `VITE_`-prefixed env vars into the bundle in plaintext. A client **ID** is public and fine; a client **secret** is not
- Any flow requiring the secret needs a backend — raise it with the user rather than improvising one
- Hold access tokens **in memory**, or `sessionStorage` if they must survive a reload. Not `localStorage`
- **Implement refresh.** Access tokens expire after 3600 seconds. Under PKCE the refresh token rotates — persist the new one each time or the session dies
- Refresh _before_ expiry, and treat a `401` as "refresh once, then retry" rather than "log the user out"

## Rate Limits

- Calculated over a **rolling 30-second window**
- Exceeding it returns **HTTP 429** with a **`Retry-After` header, in seconds**
- **Always honour `Retry-After`** — wait at least that long. Use exponential backoff only as a fallback when the header is absent
- Some endpoints carry their own limits separate from the app-wide one
- Development mode has a markedly lower limit than extended quota — see below

## Quota Mode — Plan Around Development Mode

This app will stay in **development mode**:

- **Maximum 5 authenticated users**, each manually allowlisted in the Dashboard's Users Management tab
- A non-allowlisted user gets **403**, not a login prompt. Surface that as a clear message, not a generic error
- The app owner must hold a **Premium** account
- **Extended quota mode is not realistically available**: as of 15 May 2025 it requires a registered business (not individuals), a launched service, and **250,000+ monthly active users**

**Never design a feature that assumes unlimited users or extended-quota rate limits.**

## Error Handling

Handle every documented status, not just the happy path:

- `401` — expired/invalid token → refresh once, retry, then re-authenticate
- `403` — bad scope, user not allowlisted, or restricted endpoint. Distinguish these in the message
- `404` — resource gone or not visible in this `market`
- `429` — back off per `Retry-After`
- `5xx` — retry with backoff; do not hammer

## Request Hygiene

- Pass `market` (or `country`) where the spec offers it — availability is regional, and omitting it produces confusing empty results
- Respect pagination (`limit`, `offset`); `limit` caps at 50 on most endpoints, 20 on some
- Batch where a live multi-get exists instead of looping single fetches — but check first: Spotify has deprecated most of them (`GET /tracks`, `GET /albums`, `GET /artists` are all marked dead), so looping the single-resource endpoint is often now the only option
- **Validate responses at the boundary** rather than asserting types onto `await res.json()`

## Developer Terms

- **No excessive caching** — do not build a persistent local mirror of Spotify's catalogue
- **Attribute Spotify** and follow the design guidelines wherever content is displayed

## Review Checklist

Before calling any Spotify-touching change done:

- [ ] Correct OAuth flow (PKCE for user data; never Implicit)
- [ ] Redirect URI is HTTPS or `127.0.0.1`, never `localhost`, and matches the Dashboard exactly
- [ ] Minimum scopes only
- [ ] No client secret anywhere in the bundle
- [ ] Token refresh implemented, rotated refresh token persisted
- [ ] `429` honours `Retry-After`
- [ ] `401`/`403`/`404`/`5xx` all handled distinctly
- [ ] Every endpoint cross-checked against the OpenAPI spec, and none from the restricted list
- [ ] Tests mock the network — no live API calls in the suite
