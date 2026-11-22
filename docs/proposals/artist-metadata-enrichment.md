# Proposal: Artist Metadata Enrichment

**Status: proposal. Not actioned, no code written.** Captured for future reference.

All figures below were measured live against the real endpoints on **22 November 2026**. Coverage
percentages will drift upward over time as editors add data; re-measure before relying on them.

## Problem

Given a list of Spotify artists (from the library, or from an Extended Streaming History import), we
want facets to sort and group by — country of origin above all, plus era, solo-vs-band and so on.

Neither existing source serves this:

- **Spotify** exposes no geography at all, and `genres` is deprecated (see
  `docs/spotify-api-context.md`). Its per-artist lookup is also one request per artist.
- **Last.fm** gives tags only. No country, no formation date, no structured anything.

## Verdict

| Need                          | Use                                       | Why                                      |
| ----------------------------- | ----------------------------------------- | ---------------------------------------- |
| Country, era, type            | **Wikidata Query Service**                | Batched, keyless, CORS-open, CC0         |
| Fallback for misses           | **MusicBrainz** `/ws/2/url?resource=`     | Richer geography, but 1 req/s            |
| Artist image                  | **Spotify** `GET /artists/{id}`           | Already authenticated, no licence burden |
| Album art                     | **Spotify**, already in the track payload | Zero extra requests                      |
| Album art without Spotify IDs | **Cover Art Archive**                     | Keyed by the MBID we would already store |

Wikidata first because it is the only source that answers in bulk. Everything else is a per-artist
request.

## Wikidata Query Service

### The query

`https://query.wikidata.org/sparql`, **POST** form-encoded (a 500-ID batch is ~12.7 KB, far past any
GET URL limit).

```sparql
SELECT ?spotify ?mbid ?iso ?countryLabel ?type WHERE {
  VALUES ?spotify { "4Z8W4fKeB5YxbusRsdQVPb" "3sPiEqLcANa5kAp5RnEHNq" }
  ?a wdt:P1902 ?spotify .
  OPTIONAL { ?a wdt:P31  ?type }     # human vs musical group
  OPTIONAL { ?a wdt:P434 ?mbid }     # MusicBrainz artist ID, to chain to MB
  OPTIONAL { ?a wdt:P27  ?country }  # country of citizenship (people)
  OPTIONAL { ?a wdt:P495 ?country }  # country of origin (bands)
  OPTIONAL { ?country wdt:P297 ?iso } # ISO 3166-1 alpha-2
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
```

Measured: **500 IDs resolved in 1.5 seconds, one request.** No API key, no User-Agent gate,
`access-control-allow-origin: *`, data is CC0.

Spotify artist ID is a first-class property (`P1902`), so no name matching is needed anywhere — which
matters, because artist names are not unique and name matching against MusicBrainz is known to return
the wrong artist.

### Coverage

Over the **71,294** artists that carry a Spotify ID:

| Property       | Field                      |  Count | Coverage |
| -------------- | -------------------------- | -----: | -------: |
| `P31`          | instance of (human / band) | 69,065 |    96.9% |
| `P27` + `P495` | **country (union)**        | 66,633 |    93.5% |
| `P434`         | MusicBrainz artist ID      | 56,339 |    79.0% |
| `P1953`        | Discogs artist ID          | 51,819 |    72.7% |
| `P106`         | occupation                 | 46,625 |    65.4% |
| `P21`          | sex or gender              | 45,771 |    64.2% |
| `P136`         | genre                      | 39,601 |    55.5% |
| `P569`         | date of birth              | 38,840 |    54.5% |
| `P19`          | place of birth             | 35,920 |    50.4% |
| `P18`          | image (Commons)            | 33,360 |    46.8% |
| `P2003`        | Instagram username         | 33,300 |    46.7% |
| `P856`         | official website           | 32,732 |    45.9% |
| `P1412`        | languages sung/spoken      | 29,777 |    41.8% |
| `P373`         | Commons category           | 26,733 |    37.5% |
| `P1303`        | instrument                 | 25,178 |    35.3% |
| `P264`         | record label               | 21,547 |    30.2% |
| `P3192`        | Last.fm ID                 | 21,299 |    29.9% |
| `P571`         | inception (band formed)    | 13,374 |    18.8% |
| `P463`         | member of                  |  9,002 |    12.6% |
| `P527`         | has part (band members)    |  7,217 |    10.1% |
| `P570`         | date of death              |  6,316 |     8.9% |
| `P154`         | logo image                 |  1,533 |     2.2% |

**Two properties are needed for country, not one.** The population splits 47,062 humans (66%) /
17,709 musical groups (25%), with duos and ensembles in the tail. Humans carry `P27`, groups carry
`P495`; the two are near-disjoint, which is why 59% + 27% unions to 93.5%. Same pattern for dates:
coalesce `P569` (birth) with `P571` (inception) into one "active from".

The limiting factor is **notability, not secrecy**: 71k items is a small slice of Spotify's catalogue,
and an artist either has an item or does not. Within the set that has one, country is 93.5% filled —
half-populated artists are rare. Treat Unknown as a first-class bucket, not a parse failure.

### Provenance — it is community-entered and mostly unsourced

Of the 47,246 `P27` statements on Spotify-linked artists:

| Reference on the statement               |  Count | Share |
| ---------------------------------------- | -----: | ----: |
| **No reference at all**                  | 35,071 |   74% |
| "Imported from Wikipedia" (bot, infobox) |  7,555 |   16% |
| "Stated in" a database                   |  2,947 |    6% |

When sourced, the cited databases are MusicBrainz (1,086), LIBRIS (309), the German National Library
(181), BnF (165), GND (146), VIAF (55) and Discogs (40). Note the circularity: for a chunk of artists
Wikidata and MusicBrainz are **not** independent confirmations of the same fact.

Mitigation is built in. Statements carry ranks (preferred / normal / deprecated) and the `wdt:` prefix
returns best-rank only, silently dropping deprecated values. Good enough for "which country is this
band from"; do not build anything load-bearing on fields like `net worth`.

### Can we type it?

**Wikidata publishes no schema for artists.** A search of the EntitySchema (ShEx) namespace for
musician / band / artist shapes returns zero results. The model is open-world: any property on any
item, nothing required. One artist has 477 properties, another has four.

That does not matter, because we do not consume items — we consume a `SELECT`, and the projection
_is_ the schema. Each property publishes a machine-readable datatype:

```
P31  instance of     WikibaseItem      P569 date of birth  Time
P27  citizenship     WikibaseItem      P571 inception      Time
P495 country origin  WikibaseItem      P297 ISO code       ExternalId
P19  place of birth  WikibaseItem      P434 MusicBrainz ID ExternalId
P136 genre           WikibaseItem      P18  image          CommonsMedia
```

| Wikidata datatype               | Column            |
| ------------------------------- | ----------------- |
| `WikibaseItem`                  | Q-id + label      |
| `Time`                          | year (see below)  |
| `ExternalId` / `String` / `Url` | `TEXT`            |
| `Quantity`                      | value + unit Q-id |
| `CommonsMedia`                  | `TEXT` URL        |

Target shape, every field nullable:

```ts
type ArtistOrigin = {
  spotifyArtistId: string
  isGroup: boolean
  countryQid: string | null
  countryLabel: string | null
  countryIso: string | null
  musicBrainzId: string | null
  activeFrom: number | null
}
```

Properties are effectively never deleted or re-typed, so a query written today keeps parsing. Values
improve, the shape does not move.

### Traps

- **Defunct states.** 1,935 artists (2.9% of those with a country) resolve to a state with no current
  ISO code. `Czechoslovakia` and `Socialist Federal Republic of Yugoslavia` return no `P297` at all;
  `Soviet Union` → `SU`, `East Germany` → `DD`, `Yugoslavia` → `YU` are **withdrawn** codes that match
  no modern country list and render no flag emoji. `P1366` ("replaced by") exists but is one-to-many —
  the Soviet Union returns 15 successor states, so there is no automatic right answer. Keep the
  historic label and give it its own group rather than guessing.
- **Everything is multi-valued.** `WikibaseItem` properties are sets. Dual citizenship yields two rows
  for one artist, and SPARQL returns the cross-product — two citizenships × three genres = six rows.
  `GROUP_CONCAT`/`SAMPLE` in the query, or dedupe on the Spotify ID after.
- **`Time` carries a precision flag.** A value meaning "1991" still serialises as a full dateTime, so
  `1991-01-01` may be real or may be year-precision padding. Store the year unless also fetching
  precision via `psv:` / `wikibase:timePrecision`.
- **Labels are a separate lookup** and can be missing — one test artist's label came back as the bare
  `Q44190`. Use Spotify's artist name for display; take only the country from Wikidata.
- **Aggregations time out.** `GROUP BY` over the full 71k set with the label service attached exceeded
  the public timeout repeatedly. Batch lookups are fine; analytics over the whole set are not.

## MusicBrainz — the fallback

Exact-match URL lookup resolves a Spotify artist URL and returns the country **inline in the same
response**, so it is one request, not two:

```
GET /ws/2/url?resource=https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb&fmt=json&inc=artist-rels
→ relations[0].artist = { name: "Radiohead", country: "GB", type: "Group", id: "a74b1b7f-…" }
```

A lookup by MBID gives more than Wikidata does — verified on Radiohead: `area` United Kingdom (GB),
`begin-area` Abingdon-on-Thames, `type` Group, `life-span.begin` 1991, plus ISNI, and `gender` for
solo artists. Name search works as a last resort and returns country with a match score
(`Carpenter Brut` → `FR`, score 100).

### Traps

- **Errors arrive as HTTP 200.** `{"error": "The MusicBrainz web server is currently busy…"}` came back
  with a 200 status on **3 of 5 attempts**. Inspect the body; never trust the status code. Retry with
  backoff.
- **1 req/s, hard**, and a descriptive `User-Agent` with contact details is mandatory — 403 without it.
- **musicbrainz.org, listenbrainz.org and coverartarchive.org share one per-IP limiter.** Trip it and
  all three refuse the client for five minutes. Do not burst cover art while resolving artists.
- `resource=` is an exact match. Strip `?si=` tracking parameters off Spotify URLs first.
- For bulk work beyond this, the escape hatch is a full data dump or a local mirror, not a faster key.

## Images

### Artist image — use Spotify

`ArtistObject.images` is **not deprecated** in the vendored spec, even though `genres`, `followers` and
`popularity` on the same object are. `ImageObject` is `{ url, height, width }`, all required, widest
first.

**The catch:** `SimplifiedArtistObject` — the stub embedded in every track and album response — has no
`images` field at all (only `external_urls`, `href`, `id`, `name`, `type`). Artist images therefore
need `GET /artists/{id}`, and `GET /artists` (the 50-at-a-time batch) is `deprecated: true` in the
spec. One request per artist, no way around it. Fold it into the same backfill pass as the country
data so it costs nothing extra in wall-clock.

### Album art — free

`SimplifiedAlbumObject` extends `AlbumBase`, which carries a non-deprecated `images` array ("the cover
art for the album in various sizes, widest first"). The simplified album object is embedded in track
responses, so **album art arrives on data we already fetch** — no extra call, no rate-limit cost.
`/albums/{id}` is live; only the `/albums` batch route is deprecated.

### Cover Art Archive — album art without Spotify IDs

Keyed by the MBID we would already be storing:

```
GET https://coverartarchive.org/release-group/{mbid}
→ { images: [{ front: true, thumbnails: { "250": …, "500": …, "1200": … } }] }
GET .../front-250  → 307 → 302 → 200 image/jpeg, 41 KB
```

`access-control-allow-origin: *`, no key, pre-made thumbnails, and a `front-250` shortcut that
redirects straight to the image so it can go in a `src` attribute. 10 req/s — but see the shared
per-IP limiter above.

### Why not Wikidata images

Delivery works (`Special:FilePath/<name>?width=300` gives 203 KB against a 2.68 MB original, CORS
open), but **licensing kills it**. Licences on a 40-image sample:

```
CC BY-SA 4.0   19     CC BY-SA 2.0    2
Public domain   4     CC BY 4.0       2
CC BY 3.0       4     CC BY-SA 2.5    1
CC BY-SA 3.0    2     CC BY-SA 3.0 de 1
CC BY 2.0       2     Attribution     1
CC0             2
```

Only 6 of 40 (public domain + CC0) are attribution-free; 34 require visible credit and 25 of those are
share-alike. 39 of 40 carry a populated attribution field we would be obliged to render. Too much
legal apparatus for a thumbnail, at 46.8% coverage, in inconsistent crops.

## Rejected sources

| Source         | Verdict                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **TheAudioDB** | Free test key `2` is dead — returns `{"Message":"Not found"}`. Patreon-gated.                   |
| **Deezer**     | No `access-control-allow-origin` header, so not browser-callable — and no country field anyway. |
| **Discogs**    | No structured country; it is freeform prose in `profile`.                                       |
| **Last.fm**    | Tags only, no geography. Already integrated and already known to be sparse.                     |

## Sizing

The measured export in `docs/streaming-history-context.md` has **9,179 unique artist names**. Assuming
a similar count of distinct Spotify artist IDs:

- **Wikidata**: ~19 batches of 500 ≈ **30 seconds total**.
- **MusicBrainz fallback**, at 1 req/s, only for what Wikidata misses: if ~35% miss, ~3,200 requests ≈
  **55 minutes**, one-off and backgroundable.
- **Spotify artist images**: ~9,179 single-artist requests, the dominant cost. Only worth doing for
  artists actually surfaced in the UI, not the whole history.

Artist origin does not change, so the cache never needs invalidating.

## If this gets built

- Persist `spotifyArtistId → { iso, countryLabel, countryQid, mbid, isGroup, activeFrom }`; the MBID is
  the join key for any later MusicBrainz or Cover Art Archive work.
- Parse SPARQL bindings into `ArtistOrigin` at the boundary rather than asserting — same rule as
  Spotify responses (`docs/spotify-api-context.md`).
- Decide up front whether the facet means **nationality** or **where the act formed**. `P27` and
  MusicBrainz `area` disagree for expat solo artists and bands formed abroad, and there is no single
  correct reading.
- Wikidata and MusicBrainz data are CC0 and ours to keep. Spotify artwork is not — the spec tags those
  endpoints with `x-spotify-policy-list: metadataPolicyList`, which governs caching and display. Check
  the terms before persisting image URLs into the history DB.
